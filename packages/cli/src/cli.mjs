import { commandAddSpace, commandAudit, commandDoctor, commandExport, commandInit, commandPrompt, commandStatus, commandSync, helpText } from './commands.mjs';
import { UsageError, VERSION, parseArgs, printResult } from './lib.mjs';

export async function runCli(argv) {
  const wantsJson = argv.some((value) => value === '--json' || value === '--json=true');
  try {
    const { command, positionals, options } = parseArgs(argv);
    let response;
    if (['help', '--help', '-h'].includes(command)) {
      if (options.json) {
        printResult({ ok: true, command: 'help', version: VERSION, summary: 'Ayuda de Context OS.', data: { text: helpText() } }, { json: true });
      } else process.stdout.write(helpText());
      return 0;
    }
    if (['version', '--version', '-v'].includes(command)) {
      if (options.json) {
        printResult({ ok: true, command: 'version', version: VERSION, summary: `Context OS ${VERSION}.`, data: { version: VERSION } }, { json: true });
      } else process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (command === 'init') response = await commandInit(positionals, options);
    else if (command === 'audit') response = await commandAudit(positionals, options);
    else if (command === 'doctor') response = await commandDoctor(positionals, options);
    else if (command === 'add-space') response = await commandAddSpace(positionals, options);
    else if (command === 'sync') response = await commandSync(positionals, options);
    else if (command === 'export') response = await commandExport(positionals, options);
    else if (command === 'status') response = await commandStatus(positionals, options);
    else if (command === 'prompt') response = await commandPrompt(positionals, options);
    else throw new UsageError(`Comando desconocido: ${command}`);

    if (response.raw !== undefined) {
      if (options.json) {
        printResult({
          ok: true,
          command: 'prompt',
          version: VERSION,
          summary: `Prompt disponible: ${positionals[0]}.`,
          data: { name: positionals[0], text: response.raw },
        }, { json: true });
      } else {
        process.stdout.write(response.raw.endsWith('\n') ? response.raw : `${response.raw}\n`);
      }
    } else printResult(response.result, { json: options.json });
    return response.code;
  } catch (error) {
    const message = error instanceof UsageError ? error.message : 'La operación falló. Ejecuta de nuevo con una ruta específica y revisa permisos.';
    if (wantsJson) process.stdout.write(`${JSON.stringify({ ok: false, command: argv[0] ?? 'help', version: VERSION, summary: message })}\n`);
    else process.stderr.write(`Error: ${message}\n`);
    return 2;
  }
}
