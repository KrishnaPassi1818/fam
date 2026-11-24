#!/usr/bin/env python3
"""CLI interface for the Task Manager."""

import argparse

from task import Task, TaskManager


def main(args=None):
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="Task Manager CLI")
    parser.add_argument("command", choices=["add", "list", "complete", "remove"],
                        help="Command to execute")
    
    args_parsed = parser.parse_args(args)

    manager = TaskManager()

    if args_parsed.command == "add":
        title = input("Task title: ")
        description = input("Description (optional, press Enter to skip): ").strip() or ""
        due_date = input("Due date (YYYY-MM-DD, optional, press Enter to skip): ").strip() or None
        task = manager.add_task(title, description, due_date)
        print(f"✓ Task created: {task}")

    elif args_parsed.command == "list":
        tasks = manager.get_tasks()
        if not tasks:
            print("No tasks found.")
        else:
            print("\nTasks:")
            for i, task in enumerate(tasks, 1):
                status = "[✓]" if task.completed else "[ ]"
                due_str = f" (due {task.due_date})" if task.due_date else ""
                print(f"{i}. {status} {task.title}{due_str}")

    elif args_parsed.command == "complete":
        # Simple interactive mode: mark first task as complete, or prompt for index
        tasks = manager.get_tasks()
        if not tasks:
            print("No tasks to complete.")
        else:
            print("\nCurrent tasks:")
            for i, task in enumerate(tasks, 1):
                status = "[✓]" if task.completed else "[ ]"
                print(f"{i}. {status} {task.title}")
            
            choice = input(f"\nEnter task number to complete (or 'all') and Enter: ").strip()
            if choice.lower() in ["exit", "quit"]:
                print("Goodbye!")
                return
            elif choice.lower() == "all":
                manager.mark_complete()
                print("All tasks completed.")
            else:
                try:
                    index = int(choice) - 1
                    if 0 <= index < len(tasks):
                        tasks[index].mark_complete()
                        print(f"✓ Task '{tasks[index].title}' completed.")
                    else:
                        print(f"Invalid task number. Available: {len(tasks)}.")
                except ValueError:
                    print("Please enter a valid number or 'all'.")

    elif args_parsed.command == "remove":
        title = input("Task title to remove: ")
        try:
            manager.remove_task(title)
            print(f"✓ Task '{title}' removed.")
        except ValueError as e:
            print(f"✗ {e}")


if __name__ == "__main__":
    main()
