import { readTab } from "./google";

export async function crewNames(ids) {
  if (!ids) return [];
  const people = await readTab("People").catch(() => []);
  return ids.split(",").map((id) => people.find((p) => p.id === id)).filter(Boolean).map((p) => `${p.name}${p.role ? " (" + p.role + ")" : ""}`);
}

