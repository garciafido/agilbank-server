// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * El worker abre su puerto de salud antes de tomar trabajos
 * (src/workers/listenHealthServer.ts).
 *
 * Si no puede abrirlo, el arranque tiene que fallar diciendo por qué y qué
 * hacer: sin eso, un EADDRINUSE tiraba el worker sin ningún aviso útil y el
 * server seguía encolando trabajos que nadie tomaba. Una vez abierto, un error
 * tardío del health server se loguea y no tira el worker.
 *
 * El puerto sale de WORKER_HEALTH_PORT (healthPortFromEnv): 4001 si no está, y
 * si no, un entero decimal entre 1 y 65535 con el texto entero. Con otro valor el
 * worker no arranca, con un error que nombra la variable y el valor: así el
 * worker y el healthcheck (${WORKER_HEALTH_PORT:-4001} en un sh) nunca miran
 * puertos distintos.
 *
 * No usa base ni Redis. El proceso que ya tiene el puerto es un net.Server
 * abierto en el puerto que da el sistema; los errores que no se pueden provocar
 * de verdad (EACCES depende del sistema y del usuario) los emite un server de
 * mentira.
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as net from "net";
import type { Logger } from "pino";
import {
  healthPortFromEnv,
  listenHealthServer,
} from "../../../src/workers/listenHealthServer";

/** Un logger que solo anota las llamadas. */
function fakeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    debug: jest.fn(),
  };
}
const asLogger = (log: ReturnType<typeof fakeLogger>) =>
  log as unknown as Logger;

/** Lo que queda abierto en cada test, para cerrarlo al final. */
const opened: net.Server[] = [];
afterEach(async () => {
  await Promise.all(
    opened
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) =>
            server.listening ? server.close(() => resolve()) : resolve()
          )
      )
  );
});

/** Un server que escucha en el puerto que da el sistema, y ese puerto. */
async function serverOnSomePort(): Promise<{
  server: net.Server;
  port: number;
}> {
  const server = net.createServer();
  opened.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return { server, port: (server.address() as net.AddressInfo).port };
}

/** Un puerto libre: el que da el sistema, ya cerrado. */
async function freePort(): Promise<number> {
  const { server, port } = await serverOnSomePort();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function newHealthServer(): http.Server {
  const server = http.createServer();
  opened.push(server);
  return server;
}

/** Un server de mentira que, al pedirle que escuche, emite el error dado. */
function serverFailingWith(error: Error): http.Server {
  const fake = new EventEmitter() as EventEmitter & { listen: () => void };
  fake.listen = () => {
    process.nextTick(() => fake.emit("error", error));
  };
  return fake as unknown as http.Server;
}

const errnoError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

/** El error con que rechaza la promesa; falla si la promesa resuelve. */
async function rejectionOf(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("listenHealthServer resolvió, y tenía que rechazar");
}

describe("listenHealthServer", () => {
  it("con el puerto ocupado rechaza con EADDRINUSE, y el mensaje nombra el puerto y WORKER_HEALTH_PORT", async () => {
    const { port } = await serverOnSomePort();
    const health = newHealthServer();
    const log = fakeLogger();

    const error = await rejectionOf(
      listenHealthServer(health, port, asLogger(log))
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(String(port));
    expect(error.message).toContain("WORKER_HEALTH_PORT");
    expect(error.code).toBe("EADDRINUSE");
    // El original, el de net (de otro realm que el Error de jest: sin instanceof).
    expect(error.cause?.code).toBe("EADDRINUSE");
    expect(error.cause.message).toContain("EADDRINUSE");
    expect(health.listening).toBe(false);
  });

  it("sin permiso (EACCES) rechaza diciendo que no hay permiso, con el código y el original en cause", async () => {
    const original = errnoError(
      "EACCES",
      "listen EACCES: permission denied 0.0.0.0:80"
    );

    const error = await rejectionOf(
      listenHealthServer(
        serverFailingWith(original),
        80,
        asLogger(fakeLogger())
      )
    );

    // El de Node ya dice "permission denied": el propio dice además qué hacer.
    expect(error.message).not.toBe(original.message);
    expect(error.message).toMatch(/no permission/i);
    expect(error.message).toContain("80");
    expect(error.message).toContain("WORKER_HEALTH_PORT");
    expect(error.code).toBe("EACCES");
    expect(error.cause).toBe(original);
  });

  it("con otro código rechaza con el mensaje original, el código y el original en cause", async () => {
    const original = errnoError("EINVAL", "listen EINVAL: invalid argument");

    const error = await rejectionOf(
      listenHealthServer(
        serverFailingWith(original),
        4001,
        asLogger(fakeLogger())
      )
    );

    expect(error.message).toBe(original.message);
    expect(error.code).toBe("EINVAL");
    expect(error.cause).toBe(original);
  });

  it("con un puerto libre resuelve y el server queda escuchando en ese puerto", async () => {
    const port = await freePort();
    const health = newHealthServer();
    const log = fakeLogger();

    await listenHealthServer(health, port, asLogger(log));

    expect(health.listening).toBe(true);
    expect((health.address() as net.AddressInfo).port).toBe(port);
    expect(log.info).toHaveBeenCalledWith(
      { port },
      "Worker health server started"
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it("ya escuchando, un error del health server se loguea y no tira el worker", async () => {
    const port = await freePort();
    const health = newHealthServer();
    const log = fakeLogger();
    await listenHealthServer(health, port, asLogger(log));
    const late = new Error("x");

    expect(() => health.emit("error", late)).not.toThrow();

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: late, port }),
      expect.any(String)
    );
    expect(health.listening).toBe(true);
  });
});

describe("healthPortFromEnv", () => {
  it("sin la variable, o vacía, es 4001", () => {
    expect(healthPortFromEnv(undefined)).toBe(4001);
    expect(healthPortFromEnv("")).toBe(4001);
  });

  it.each([
    ["4555", 4555],
    ["1", 1],
    ["65535", 65535],
    ["04001", 4001], // decimal con ceros adelante: curl también lo lee como 4001
  ])("acepta %j", (value, port) => {
    expect(healthPortFromEnv(value)).toBe(port);
  });

  it.each([
    "abc",
    "70000",
    "0",
    "4002x",
    "-1",
    "65536",
    " 4001",
    "4001.5",
    "0x10",
  ])("rechaza %j nombrando la variable y el valor", (value) => {
    expect(() => healthPortFromEnv(value)).toThrow(Error);
    let message = "";
    try {
      healthPortFromEnv(value);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("WORKER_HEALTH_PORT");
    expect(message).toContain(JSON.stringify(value));
  });
});
