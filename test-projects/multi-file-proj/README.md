# Multi-File Project

A simple Python project demonstrating proper module structure with `main.py` and `utils.py`.

## Structure

```
├── main.py       # Main application with tests
├── utils.py      # Utility functions
├── tests/        # Test suite
│   └── test_main.py  # Pytest tests
└── README.md     # This file
```

## Usage

Run the main module:
```bash
python3 main.py
```

Run the test suite:
```bash
pytest tests/test_main.py -v
```

## Functions in utils.py

- `add(a, b)` - Returns the sum of two numbers
- `multiply(a, b)` - Returns the product of two numbers
- `greet(name)` - Returns a greeting message
