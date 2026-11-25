"""Tests for the multi-file project."""
import pytest


def test_add():
    """Test add function from utils module."""
    from utils import add
    
    assert add(2, 3) == 5
    assert add(-1, -1) == -2
    assert add(0, 0) == 0


def test_multiply():
    """Test multiply function from utils module."""
    from utils import multiply
    
    assert multiply(4, 5) == 20
    assert multiply(2, 3) == 6
    assert multiply(10, 0) == 0


def test_greet():
    """Test greet function from utils module."""
    from utils import greet
    
    assert greet("Alice") == "Hello, Alice!"
    assert greet("Bob") == "Hello, Bob!"


def test_main_functions():
    """Test functions in main module."""
    from main import main
    
    # Just ensure it doesn't raise an exception when imported
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
