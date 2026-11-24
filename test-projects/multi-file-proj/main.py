"""Main module for the multi-file project."""
from utils import add, multiply, greet


def main() -> None:
    """Run basic tests to demonstrate functionality."""
    # Test add function
    assert add(2, 3) == 5
    
    # Test multiply function
    assert multiply(4, 5) == 20
    
    # Test greet function
    assert greet("World") == "Hello, World!"
    
    print("All basic tests passed!")


if __name__ == "__main__":
    main()
