use anyhow::{bail, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Confinement {
    root: PathBuf,
}

impl Confinement {
    pub fn new(root: impl AsRef<Path>) -> Result<Self> {
        let canonical_root = std::fs::canonicalize(root.as_ref())?;
        Ok(Self {
            root: canonical_root,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Resolve and verify that the target path remains strictly confined within root.
    pub fn resolve(&self, user_path: impl AsRef<Path>) -> Result<PathBuf> {
        let p = user_path.as_ref();
        let target = if p.is_absolute() {
            p.to_path_buf()
        } else {
            self.root.join(p)
        };

        // If path exists, canonicalize directly (resolves symlinks and ../)
        if target.exists() {
            let canonical = std::fs::canonicalize(&target)?;
            if !canonical.starts_with(&self.root) {
                bail!(
                    "AccessDenied: Path '{}' escapes confinement root '{}'",
                    p.display(),
                    self.root.display()
                );
            }
            return Ok(canonical);
        }

        // If path does not exist yet (e.g. for write_file), canonicalize nearest existing parent
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
            None => self.root.clone(),
        };

        if !base_canonical.starts_with(&self.root) {
            bail!(
                "AccessDenied: Path '{}' escapes confinement root '{}'",
                p.display(),
                self.root.display()
            );
        }

        let mut final_path = base_canonical;
        for component in relative_tail.into_iter().rev() {
            final_path.push(component);
        }

        Ok(final_path)
    }

    /// Return relative path display from root if possible
    pub fn relative_display<'a>(&self, path: &'a Path) -> &'a Path {
        path.strip_prefix(&self.root).unwrap_or(path)
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
    fn test_confinement_rejects_parent_traversal_escape() {
        let tmp = tempfile::tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();

        let res = conf.resolve("../escaped.txt");
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("escapes confinement root"));
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

        let conf = Confinement::new(tmp_root.path()).unwrap();
        let res = conf.resolve("link_to_secret");
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("escapes confinement root"));
    }
}
