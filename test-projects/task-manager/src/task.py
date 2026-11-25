class Task:
    """A simple task model."""
    
    def __init__(self, title: str, description: str = "", completed: bool = False):
        self.title = title
        self.description = description
        self.completed = completed
    
    def mark_complete(self) -> None:
        """Mark this task as complete."""
        self.completed = True
