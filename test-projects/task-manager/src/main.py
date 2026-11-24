from src.task import Task

def add_task(title: str, description: str = "", completed: bool = False) -> Task:
    """Create a new task."""
    return Task(title, description, completed)
