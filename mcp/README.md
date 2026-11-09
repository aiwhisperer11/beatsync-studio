# BeatSync MCP

Servidor [MCP](https://modelcontextprotocol.io) que deja a cualquier asistente de IA editar proyectos de BeatSync Studio: importar letras, añadir y corregir frases, limpiar y exportar subtítulos.

Trabaja sobre los mismos archivos JSON que exporta la app (formato `beatsync-studio`, versión 2). Puedes editar con IA y abrir el archivo en el navegador, o al revés.

## Instalación

```bash
cd mcp
npm install
```

Requiere Node 18 o superior.

## Herramientas

| Herramienta | Qué hace |
| --- | --- |
| `create_project` | Crea un proyecto JSON vacío |
| `get_project` | Lista las frases con su índice, tiempos y escena |
| `import_lyrics` | Sustituye las frases por una letra (una por línea); los tiempos se pierden |
| `add_cue` | Añade una frase, con tiempos opcionales |
| `update_cue` | Cambia texto, tiempos o escena de una frase por su índice |
| `delete_cue` | Elimina una frase por su índice |
| `clean_cues` | Quita etiquetas de sonido, filas vacías y duplicados |
| `export_subtitles` | Genera SRT, VTT o CSV; opcionalmente lo guarda en un archivo |

Los índices empiezan en 1, igual que en la tabla de la app.

Usa **rutas absolutas** en `file`. El servidor resuelve las rutas relativas desde el directorio desde el que lo lanza el cliente, que no siempre es el que esperas.

## Conectar un cliente

El servidor usa transporte stdio. Cualquier cliente MCP que lo soporte puede lanzarlo con este comando:

```bash
node /ruta/a/beatsync/mcp/server.js
```

### Claude Code

```bash
claude mcp add beatsync -- node /ruta/a/beatsync/mcp/server.js
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beatsync": {
      "command": "node",
      "args": ["/ruta/a/beatsync/mcp/server.js"]
    }
  }
}
```

### Gemini CLI

En `~/.gemini/settings.json` (crea el archivo si no existe), añade:

```json
{
  "mcpServers": {
    "beatsync": {
      "command": "node",
      "args": ["/ruta/a/beatsync/mcp/server.js"]
    }
  }
}
```

### VS Code con GitHub Copilot (modo agente)

En `.vscode/mcp.json` dentro del proyecto que usas, o en la configuración de usuario de MCP:

```json
{
  "servers": {
    "beatsync": {
      "type": "stdio",
      "command": "node",
      "args": ["/ruta/a/beatsync/mcp/server.js"]
    }
  }
}
```

### Otros clientes (Cursor, Windsurf, etc.)

Configúralo como servidor MCP local por stdio con el mismo `command` y `args`. El formato del archivo cambia según el cliente, pero los dos valores son siempre los mismos.

> **Nota:** estas configuraciones se escribieron sin consultar la documentación actual de cada herramienta. Si el cliente no reconoce el archivo, revisa primero su guía oficial de MCP: las claves exactas (`mcpServers` o `servers`) son lo que más cambia entre versiones.

## Prueba rápida

Pide a tu asistente algo como:

> Crea un proyecto BeatSync en /ruta/a/demo.json, importa esta letra y marca los tiempos de las dos primeras frases a 1.5 y 4 segundos. Después exporta el SRT.

## Limitaciones de esta versión

- No transcribe ni alinea audio: eso ocurre en la app del navegador, que usa Whisper. Un proyecto editado aquí se abre en la app y los tiempos se mantienen.
- Las imágenes de cada frase viven en IndexedDB del navegador, así que el MCP no las ve ni las modifica.
