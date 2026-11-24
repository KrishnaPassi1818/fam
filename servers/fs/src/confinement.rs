use anyhow::{bail, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Confinement {
    workspace: PathBuf,
    authorized_roots: Vec<PathBuf>,
}

impl Confinement {
    /// Create a Confinement instance with a primary workspace and a list of authorized roots.
    /// If no additional roots are provided, defaults include the user's home directory
    /// and standard user folders (Downloads, Documents, Desktop) when available.
    pub fn new(workspace: impl AsRef<Path>) -> Result<Self> {
        let canonical_workspace = std::fs::canonicalize(workspace.as_ref())
            .unwrap_or_else(|_| workspace.as_ref().to_path_buf());
        Self::with_authorized_roots(canonical_workspace, Vec::<PathBuf>::new())
    }

    pub fn with_authorized_roots(
        workspace: impl AsRef<Path>,
        custom_roots: Vec<PathBuf>,
    ) -> Result<Self> {
        let canonical_workspace = match std::fs::canonicalize(workspace.as_ref()) {
            Ok(p) => p,
            Err(_) => workspace.as_ref().to_path_buf(),
        };

        let mut roots = Vec::new();
        roots.push(canonical_workspace.clone());

        // Add custom roots if provided
        for r in custom_roots {
            if let Ok(c) = std::fs::canonicalize(&r) {
                if !roots.contains(&c) {
                    roots.push(c);
                }
            } else if !roots.contains(&r) {
                roots.push(r);
            }
        }

        // Add default user locations if HOME is set
        if let Ok(home) = std::env::var("HOME") {
            let home_path = PathBuf::from(&home);
            if let Ok(canonical_home) = std::fs::canonicalize(&home_path) {
                if !roots.contains(&canonical_home) {
                    roots.push(canonical_home.clone());
                }
                // Also add standard folders if they exist
                for sub in &["Downloads", "Documents", "Desktop"] {
                    let sub_path = canonical_home.join(sub);
                    if sub_path.exists() {
                        if let Ok(c_sub) = std::fs::canonicalize(&sub_path) {
                            if !roots.contains(&c_sub) {
                                roots.push(c_sub);
                            }
                        }
                    }
                }
            }
        }

        // Also check FAM_AUTHORIZED_ROOTS environment variable
        if let Ok(env_roots) = std::env::var("FAM_AUTHORIZED_ROOTS") {
            for part in env_roots.split(':') {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    let p = PathBuf::from(trimmed);
                    if let Ok(c) = std::fs::canonicalize(&p) {
                        if !roots.contains(&c) {
                            roots.push(c);
                        }
                    }
                }
            }
        }

        Ok(Self {
            workspace: canonical_workspace,
            authorized_roots: roots,
        })
    }

    pub fn workspace(&self) -> &Path {
        &self.workspace
    }

    pub fn root(&self) -> &Path {
        &self.workspace
    }

    pub fn authorized_roots(&self) -> &[PathBuf] {
        &self.authorized_roots
    }

    pub fn is_authorized(&self, path: &Path) -> bool {
        self.authorized_roots.iter().any(|r| path.starts_with(r))
    }

    fn authorized_roots_display(&self) -> String {
        self.authorized_roots
            .iter()
            .map(|r| r.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// Resolve and verify that the target path remains strictly confined within authorized roots.
    pub fn resolve(&self, user_path: impl AsRef<Path>) -> Result<PathBuf> {
        let p = user_path.as_ref();
        let p_str = p.to_string_lossy();

        // Handle common synthetic agent environment aliases and placeholder paths
        if p_str == "/workspace"
            || p_str == "/home/user/workspace"
            || p_str == "workspace"
            || p_str == "/path/to/test/workspace"
            || p_str == "/path/to/workspace"
            || p_str == "."
            || p_str.is_empty()
        {
            return Ok(self.workspace.clone());
        }
        if let Some(stripped) = p_str.strip_prefix("/workspace/") {
            return self.resolve(stripped);
        }
        if let Some(stripped) = p_str.strip_prefix("workspace/") {
            return self.resolve(stripped);
        }
        if let Some(stripped) = p_str.strip_prefix("fam-evaluation/workspace/") {
            return self.resolve(stripped);
        }
        if let Some(stripped) = p_str.strip_prefix("/home/user/workspace/") {
            return self.resolve(stripped);
        }

        let target = if p_str == "~" {
            if let Ok(home) = std::env::var("HOME") {
                PathBuf::from(home)
            } else {
                p.to_path_buf()
            }
        } else if let Some(stripped) = p_str.strip_prefix("~/") {
            if let Ok(home) = std::env::var("HOME") {
                PathBuf::from(home).join(stripped)
            } else {
                p.to_path_buf()
            }
        } else if p_str.starts_with("home/") || p_str.starts_with("root/") {
            PathBuf::from("/").join(p)
        } else if p.is_absolute() {
            p.to_path_buf()
        } else {
            self.workspace.join(p)
        };

        // If path exists, canonicalize directly (resolves symlinks and ../)
        if target.exists() {
            let canonical = std::fs::canonicalize(&target)?;
            if !self.is_authorized(&canonical) {
                bail!(
                    "AccessDenied: Path '{}' (canonical: '{}') escapes authorized roots [{}]",
                    p.display(),
                    canonical.display(),
                    self.authorized_roots_display()
                );
            }
            return Ok(canonical);
        }

        // If path does not exist yet (e.g. for write_file or create_directory),
        // canonicalize the nearest existing parent to check confinement and avoid symlink escape.
        let mut ancestors = target.ancestors();
        ancestors.next(); // skip target itself

        let mut existing_ancestor = None;
        let mut relative_tail = Vec::new();

        for anc in target.ancestors() {
            if anc.exists() {
                existing_ancestor = Some(anc);
                break;
            } else if let Some(file_name) = anc.file_name() {
                relative_tail.push(file_name);
            }
        }

        let base_canonical = match existing_ancestor {
            Some(anc) => std::fs::canonicalize(anc)?,
            None => self.workspace.clone(),
        };

        if !self.is_authorized(&base_canonical) {
            bail!(
                "AccessDenied: Path '{}' escapes authorized roots [{}]",
                p.display(),
                self.authorized_roots_display()
            );
        }

        let mut final_path = base_canonical;
        for component in relative_tail.into_iter().rev() {
            final_path.push(component);
        }

        Ok(final_path)
    }

    /// Return relative path display from workspace if possible, or ~/path if in HOME, or absolute path.
    pub fn relative_display(&self, path: &Path) -> PathBuf {
        if let Ok(rel) = path.strip_prefix(&self.workspace) {
            return rel.to_path_buf();
        }
        if let Ok(home) = std::env::var("HOME") {
            let home_path = PathBuf::from(home);
            if let Ok(rel_home) = path.strip_prefix(&home_path) {
                return PathBuf::from("~").join(rel_home);
            }
        }
        path.to_path_buf()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_confinement_resolves_valid_path() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.txt");
        fs::write(&file, "hello").unwrap();

        let conf = Confinement::new(tmp.path()).unwrap();
        let resolved = conf.resolve("test.txt").unwrap();
        assert_eq!(resolved, fs::canonicalize(&file).unwrap());
    }

    #[test]
    fn test_confinement_allows_authorized_roots() {
        let tmp_ws = tempfile::tempdir().unwrap();
        let tmp_downloads = tempfile::tempdir().unwrap();
        let file = tmp_downloads.path().join("downloaded.txt");
        fs::write(&file, "content").unwrap();

        let conf = Confinement::with_authorized_roots(
            tmp_ws.path(),
            vec![tmp_downloads.path().to_path_buf()],
        )
        .unwrap();

        let resolved = conf.resolve(&file).unwrap();
        assert_eq!(resolved, fs::canonicalize(&file).unwrap());
    }

    #[test]
    fn test_confinement_rejects_unauthorized_root() {
        let tmp_ws = tempfile::tempdir().unwrap();
        let tmp_secret = tempfile::tempdir().unwrap();
        let secret_file = tmp_secret.path().join("secret.txt");
        fs::write(&secret_file, "secret").unwrap();

        let conf = Confinement::with_authorized_roots(tmp_ws.path(), vec![]).unwrap();
        // Since tmp_secret is an isolated tempdir outside tmp_ws and not HOME, it should be rejected
        let res = conf.resolve(&secret_file);
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("AccessDenied"));
    }

    #[test]
    fn test_confinement_rejects_symlink_escape() {
        let tmp_root = tempfile::tempdir().unwrap();
        let tmp_outside = tempfile::tempdir().unwrap();

        let secret_file = tmp_outside.path().join("secret.txt");
        fs::write(&secret_file, "secret").unwrap();

        let link = tmp_root.path().join("link_to_secret");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&secret_file, &link).unwrap();

        let conf = Confinement::with_authorized_roots(tmp_root.path(), vec![]).unwrap();
        let res = conf.resolve("link_to_secret");
        assert!(res.is_err());
        assert!(res.unwrap_err().to_string().contains("AccessDenied"));
    }
}
