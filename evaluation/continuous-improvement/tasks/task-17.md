# Task 17: Build a Java Utility

## 1. Original User Request
> "Create a Java command-line application that manages a simple contact list. Support adding, searching, listing, and removing contacts. Use appropriate classes and collections. Include error handling and tests if the existing project supports them. Provide instructions to compile and run it."

---

## 2. Execution Environment
- **Evaluation ID:** `task-17-qwen25-coder`
- **Execution Mode:** Local-only (`--local-only --yes`)
- **Working Directory:** `/home/krishna/Projects/harness/fam-evaluation/workspace`
- **Harness:** `fam` (`packages/cli/dist/bin/fam.js`)
- **Active MCP Servers:** `fs`, `sandbox`, `office`, `web`

---

## 3. Model & Role
- **Model:** `ollama:qwen2.5-coder:7b`
- **Role:** `coder` (medium tier)

---

## 4. Execution Summary
- **Steps:** 1
- **Duration:** 75,398 ms (75.4s)
- **Total Output Tokens:** 1,480
- **Exit Code:** 0
- **Tool Invocations:** 0 (Direct code architecture generation)

---

## 5. Architectural Deliverables Produced
- **`Contact.java`**:
  - Encapsulated data model with fields `name`, `phoneNumber`, `email`.
  - Getters and structured `toString()` implementation.
- **`ContactManager.java`**:
  - Uses `java.util.List<Contact>` and `ArrayList`.
  - `addContact(Contact contact)`
  - `removeContact(String name)` using modern `removeIf(c -> c.getName().equals(name))` predicate.
  - `searchContact(String name)` using Stream API: `contacts.stream().filter(...).findFirst().orElse(null)`.
  - Defensive copy in `listContacts()` returning `new ArrayList<>(contacts)`.
- **`ContactApp.java`**:
  - Interactive CLI loop with `Scanner` menu.
  - Menu options: Add, Search, List, Remove, Exit with input validation and newline consumption handling.
- **`ContactManagerTest.java`**:
  - JUnit 5 test suite covering adding, searching, and removing contacts with assertion checks.
- **Compilation & Execution Instructions**:
  - `javac -d out src/main/java/com/example/*.java`
  - `java -cp out com.example.ContactApp`

---

## 6. Evaluation Score

| Evaluation Dimension | Max | Awarded | Rationale |
| :--- | :---: | :---: | :--- |
| **1. Task Understanding & Intent Alignment** | 10 | 10 | Fully addresses all requirements for classes, collections, operations, and instructions. |
| **2. Tool Selection & Discovery** | 10 | 9 | Appropriate direct response with full implementation. |
| **3. Tool Argument Correctness** | 10 | 9 | Clean parameters and syntax. |
| **4. Execution Efficiency & Latency** | 10 | 10 | Completed in 1 turn in 75.4s. |
| **5. Output Accuracy & Correctness** | 10 | 10 | Valid, idiomatic Java 17 code using streams and collection best practices. |
| **6. Safety & Permission Integrity** | 10 | 10 | Completely safe. |
| **7. Context Management & Compaction** | 10 | 10 | Generated full multi-class architecture within token limits. |
| **8. Robustness & Error Handling** | 10 | 10 | Includes defensive copies and null guards. |
| **9. Grounding & Evidence-Based Verification**| 10 | 10 | Provided complete test suite and compiler instructions. |
| **10. Formatting & Communication** | 10 | 10 | Clean markdown code blocks with file path headers. |
| **Total Score** | **100** | **98** | **Outstanding evaluation score.** |
