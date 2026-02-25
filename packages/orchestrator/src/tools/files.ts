import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

export async function executeReadFile(
  input: Record<string, unknown>,
): Promise<string> {
  const path = input.path as string;
  if (!path) throw new Error("read_file requires a 'path' argument");

  const content = await readFile(path, "utf-8");
  return content;
}

export async function executeWriteFile(
  input: Record<string, unknown>,
): Promise<string> {
  const path = input.path as string;
  const content = input.content as string;
  if (!path) throw new Error("write_file requires a 'path' argument");
  if (content === undefined) throw new Error("write_file requires a 'content' argument");

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
  return `Written ${content.length} bytes to ${path}`;
}

export async function executeEditFile(
  input: Record<string, unknown>,
): Promise<string> {
  const path = input.path as string;
  const oldString = input.old_string as string;
  const newString = input.new_string as string;

  if (!path) throw new Error("edit_file requires a 'path' argument");
  if (!oldString) throw new Error("edit_file requires an 'old_string' argument");
  if (newString === undefined) throw new Error("edit_file requires a 'new_string' argument");

  const content = await readFile(path, "utf-8");
  const occurrences = content.split(oldString).length - 1;

  if (occurrences === 0) {
    throw new Error(`old_string not found in ${path}`);
  }
  if (occurrences > 1) {
    throw new Error(
      `old_string appears ${occurrences} times in ${path}, must be unique`,
    );
  }

  const newContent = content.replace(oldString, newString);
  await writeFile(path, newContent, "utf-8");
  return `Edited ${path}`;
}
