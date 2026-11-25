import pytest
from math_utils import factorial, fibonacci


class TestFactorial:
    """Test cases for factorial function."""
    
    def test_factorial_zero(self):
        assert factorial(0) == 1
    
    def test_factorial_one(self):
        assert factorial(1) == 1
    
    def test_factorial_two(self):
        assert factorial(2) == 2
    
    def test_factorial_five(self):
        assert factorial(5) == 120
    
    def test_factorial_ten(self):
        assert factorial(10) == 3628800
    
    def test_factorial_negative_raises_error(self):
        with pytest.raises(ValueError):
            factorial(-1)


class TestFibonacci:
    """Test cases for fibonacci function."""
    
    def test_fibonacci_zero(self):
        assert fibonacci(0) == 0
    
    def test_fibonacci_one(self):
        assert fibonacci(1) == 1
    
    def test_fibonacci_two(self):
        assert fibonacci(2) == 1
    
    def test_fibonacci_three(self):
        assert fibonacci(3) == 2
    
    def test_fibonacci_five(self):
        assert fibonacci(5) == 5
    
    def test_fibonacci_ten(self):
        assert fibonacci(10) == 55
    
    def test_fibonacci_negative_raises_error(self):
        with pytest.raises(ValueError):
            fibonacci(-1)
