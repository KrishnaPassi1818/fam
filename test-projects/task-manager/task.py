"""Task Manager - A simple task management application."""


class Task:
    """Represents a single task."""

    def __init__(self, title: str, description: str = "", due_date: str | None = None):
        """Initialize a task.

        Args:
            title: The task title.
            description: Optional task description.
            due_date: Optional due date as string (YYYY-MM-DD).
        """
        self.title = title
        self.description = description
        self.due_date = due_date
        self.completed = False

    def __repr__(self):
        return f"Task(title='{self.title}', completed={self.completed})"

    def mark_complete(self):
        """Mark this task as complete."""
        self.completed = True


class TaskManager:
    """Manages a collection of tasks."""

    def __init__(self):
        """Initialize the task manager with an empty list."""
        self.tasks: list[Task] = []

    def add_task(self, title: str, description: str = "", due_date: str | None = None) -> Task:
        """Add a new task to the manager.

        Args:
            title: The task title.
            description: Optional task description.
            due_date: Optional due date as string (YYYY-MM-DD).

        Returns:
            The newly created Task object.
        """
        task = Task(title, description, due_date)
        self.tasks.append(task)
        return task

    def get_tasks(self) -> list[Task]:
        """Get all tasks from the manager.

        Returns:
            List of all Task objects.
        """
        return self.tasks

    def count_completed(self) -> int:
        """Count the number of completed tasks.

        Returns:
            Number of completed tasks.
        """
        return sum(1 for task in self.tasks if task.completed)

    def mark_complete(self, task: Task | None = None):
        """Mark a task as complete.

        Args:
            task: The task to mark. If None, marks all tasks.
        """
        if task is not None:
            task.mark_complete()
        else:
            for t in self.tasks:
                t.mark_complete()

    def remove_task(self, title: str):
        """Remove a task by title.

        Args:
            title: The title of the task to remove.

        Raises:
            ValueError: If no task with the given title exists.
        """
        found = False
        for i, t in enumerate(self.tasks):
            if t.title == title:
                self.tasks.pop(i)
                found = True
                break

        if not found:
            raise ValueError(f"Task '{title}' not found")
