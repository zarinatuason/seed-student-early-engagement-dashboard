import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  db,
  workspaceSessionsTable,
} from "@workspace/db";
import { setupExampleWorkspace } from "./lib/example-workspace";
import { saveIncomingMessage } from "./lib/incoming-message";
import { deleteSessionWorkflowData } from "./lib/workspace-session";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function run(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "setup-examples") {
    const sessionId = option(args, "--session-id");
    if (!sessionId) throw new Error("Usage: facilitator setup-examples --session-id SESSION_ID");
    await setupExampleWorkspace(sessionId);
    process.stdout.write("Prepared example workspace is present; existing messages were preserved.\n");
    return;
  }
  if (command === "incoming") {
    const sessionId = option(args, "--session-id");
    const conversationId = option(args, "--conversation-id");
    const eventId = option(args, "--event-id");
    const rawDay = option(args, "--day");
    const subject = option(args, "--subject");
    const textFile = option(args, "--text-file");
    const day = Number(rawDay);
    if (!sessionId || !conversationId || !eventId || !rawDay || !subject || !textFile || !Number.isInteger(day)) {
      throw new Error(
        "Usage: facilitator incoming --session-id ID --conversation-id ID --event-id ID --day N --subject SUBJECT --text-file PATH",
      );
    }
    const text = await readFile(textFile, "utf8");
    const message = await saveIncomingMessage({
      sessionId,
      conversationId,
      eventId,
      day,
      subject,
      text,
    });
    process.stdout.write(`Incoming message saved or already present (message ${message.id}).\n`);
    return;
  }
  if (command === "delete-test-session") {
    const sessionId = option(args, "--session-id");
    const confirmation = option(args, "--confirm");
    if (!sessionId || confirmation !== "DELETE-TEST-SESSION") {
      throw new Error(
        "Usage: facilitator delete-test-session --session-id ID --confirm DELETE-TEST-SESSION",
      );
    }
    const [session] = await db
      .select()
      .from(workspaceSessionsTable)
      .where(eq(workspaceSessionsTable.id, sessionId))
      .limit(1);
    if (!session) throw new Error("Workspace session not found.");
    if (!session.label.startsWith("seed-v2-test")) {
      throw new Error("Refusing to delete a session not positively identified by the seed-v2-test label prefix.");
    }
    await db.transaction(async (tx) => {
      await deleteSessionWorkflowData(tx, sessionId);
      await tx.delete(workspaceSessionsTable).where(eq(workspaceSessionsTable.id, sessionId));
    });
    process.stdout.write("Confirmed automated test session and its workflow data were deleted.\n");
    return;
  }
  throw new Error(
    "Commands: setup-examples, incoming, delete-test-session.",
  );
}

run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Facilitator command failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });