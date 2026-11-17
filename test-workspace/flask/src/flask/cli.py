import click
import json
from functools import wraps

def with_appcontext(f):
    @wraps(f)
    def decorator(*args, **kwargs):
        return f(*args, **kwargs)
    return decorator

@click.group()
def cli():
    """This is the main entry point for the Flask CLI."""
    pass

@cli.command("run", short_help="Run a development server.")
def run_command():
    click.echo("Running development server...")

@cli.command("shell", short_help="Run an interactive Python shell.")
def shell_command():
    click.echo("Running interactive shell...")
