import pytest

def test_cli_help(runner):
    result = runner.invoke(args=["--help"])
    assert result.exit_code == 0
    assert "Show this message and exit." in result.output
