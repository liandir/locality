import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ChatStorage } from "../src/chat/storage.js";

vi.mock("node:os", async importOriginal => ({
  ...await importOriginal<typeof import("node:os")>(),
  homedir: vi.fn()
}));

let root: string;
let home: string;
let workspace: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "locality-storage-location-"));
  home = path.join(root, "home");
  workspace = path.join(root, "workspace");
  vi.mocked(os.homedir).mockReturnValue(home);
  await fs.mkdir(workspace, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("Locality storage location", () => {
  it("saves and reloads chats and attachments under ~/.locality", async () => {
    const storage = new ChatStorage(workspace);
    const record = storage.newRecord("native");
    const attachment = await storage.importAttachmentBytes(record.id, "notes.txt", Buffer.from("Project notes"));
    record.messages = [{ role: "user", content: "Read this", ts: 1, attachments: [attachment] }];
    await storage.save(record);

    expect(storage.attachmentsRoot()).toBe(path.join(home, ".locality", "attachments"));
    await expect(fs.readFile(path.join(home, ".locality", `${record.id}.json`), "utf8")).resolves.toContain("Read this");
    const reopened = new ChatStorage(workspace);
    await expect(reopened.load(record.id)).resolves.toMatchObject(record);
    await expect(reopened.attachmentText(record.id, attachment)).resolves.toBe("Project notes");
    await expect(fs.readdir(home)).resolves.toEqual([".locality"]);
  });

  it("starts empty without importing or altering chats from other storage folders", async () => {
    for (const directory of [path.join(home, "archive"), path.join(workspace, ".locality")]) {
      const separate = new ChatStorage(workspace, directory);
      const record = separate.newRecord("native");
      await separate.save(record);
      const source = path.join(directory, `${record.id}.json`);
      const original = await fs.readFile(source, "utf8");
      const storage = new ChatStorage(workspace);

      await expect(storage.list()).resolves.toEqual([]);
      await expect(storage.load(record.id)).resolves.toBeUndefined();
      await expect(fs.readFile(source, "utf8")).resolves.toBe(original);
    }
  });
});
