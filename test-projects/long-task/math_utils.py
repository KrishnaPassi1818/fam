def factorial(n):
    """Calculate factorial of n.
    
    Args:
        n: Non-negative integer
        
    Returns:
        Factorial of n
        
    Raises:
        ValueError: If n is negative
    """
    if n < 0:
        raise ValueError("factorial() not defined for negative numbers")
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    
    return result


def fibonacci(n):
    """Calculate the nth Fibonacci number.
    
    Args:
        n: Non-negative integer
        
    Returns:
        The nth Fibonacci number (F0 = 0, F1 = 1, F2 = 1, ...)
        
    Raises:
        ValueError: If n is negative
    """
    if n < 0:
        raise ValueError("fibonacci() not defined for negative numbers")
    
    if n <= 1:
        return n
    
    prev, curr = 0, 1
    for _ in range(2, n + 1):
        prev, curr = curr, prev + curr
    
    return curr
