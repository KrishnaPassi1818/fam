from src.main import add_task
from src.task import Task

def test_task_init():
    """Test basic task creation."""
    task = Task("Buy milk", "At the grocery store", False)
    assert task.title == "Buy milk"
    assert task.description == "At the grocery store"
    assert task.completed is False

def test_task_mark_complete():
    """Test marking a task as complete."""
    task = Task("Fix laptop", "", False)
    assert not task.completed
    
    task.mark_complete()
    assert task.completed is True

def test_add_task_basic():
    """Test creating a task via add_task function."""
    task = add_task("Walk dog")
    assert task.title == "Walk dog"
    assert task.completed is False

def test_add_task_with_description():
    """Test adding a task with description."""
    task = add_task("Clean room", "Daily chore")
    assert task.title == "Clean room"
    assert task.description == "Daily chore"

def test_mark_complete_twice():
    """Test marking as complete twice (idempotent)."""
    task = Task("Simple task", "", False)
    task.mark_complete()
    assert task.completed is True
    
    task.mark_complete()
    assert task.completed is True
