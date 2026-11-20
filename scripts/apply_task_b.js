const fs = require('fs');
const path = require('path');

const flaskDir = path.resolve(__dirname, '..', 'flask-real');
const cliPath = path.join(flaskDir, 'src', 'flask', 'cli.py');
const testPath = path.join(flaskDir, 'tests', 'test_cli.py');
const docsPath = path.join(flaskDir, 'docs', 'cli.rst');

// 1. Update src/flask/cli.py
let cli = fs.readFileSync(cliPath, 'utf-8');
if (!cli.includes('config_command')) {
  cli = cli.replace(
    'self.add_command(routes_command)',
    'self.add_command(routes_command)\n            self.add_command(config_command)'
  );

  const cmdDef = `@click.command("config", short_help="Show the configuration for the app.")
@with_appcontext
def config_command() -> None:
    """Print the loaded application's configuration as JSON, masking
    the values of any key containing SECRET, PASSWORD, TOKEN or KEY as '***'.
    """
    import json
    sensitive = ("SECRET", "PASSWORD", "TOKEN", "KEY")
    masked = {}
    for key, val in current_app.config.items():
        if any(s in key.upper() for s in sensitive):
            masked[key] = "***"
        else:
            try:
                json.dumps(val)
                masked[key] = val
            except (TypeError, OverflowError):
                masked[key] = str(val)
    click.echo(json.dumps(masked, indent=2))


`;
  cli = cli.replace('cli = FlaskGroup(', cmdDef + 'cli = FlaskGroup(');
  fs.writeFileSync(cliPath, cli, 'utf-8');
  console.log('✅ src/flask/cli.py updated with config_command');
}

// 2. Update tests/test_cli.py
let testCli = fs.readFileSync(testPath, 'utf-8');
if (!testCli.includes('test_config_command')) {
  const testDef = `

def test_config_command(runner, app):
    app.config["SECRET_KEY"] = "super-secret"
    app.config["API_TOKEN"] = "token-123"
    app.config["PASSWORD_HASH"] = "hash-abc"
    app.config["PUBLIC_SETTING"] = "hello"
    result = runner.invoke(args=["config"])
    assert result.exit_code == 0
    import json
    data = json.loads(result.output)
    assert data["SECRET_KEY"] == "***"
    assert data["API_TOKEN"] == "***"
    assert data["PASSWORD_HASH"] == "***"
    assert data["PUBLIC_SETTING"] == "hello"
`;
  fs.writeFileSync(testPath, testCli + testDef, 'utf-8');
  console.log('✅ tests/test_cli.py updated with test_config_command');
}

// 3. Update docs/cli.rst
let docs = fs.readFileSync(docsPath, 'utf-8');
if (!docs.includes('Show Application Configuration')) {
  const docDef = `

Show Application Configuration
------------------------------

The \`\`config\`\` command will print the configuration for the active application as JSON,
automatically masking sensitive keys such as \`\`SECRET\`\`, \`\`PASSWORD\`\`, \`\`TOKEN\`\`, or \`\`KEY\`\`::

    $ flask --app hello config
`;
  fs.writeFileSync(docsPath, docs + docDef, 'utf-8');
  console.log('✅ docs/cli.rst updated with config documentation');
}
