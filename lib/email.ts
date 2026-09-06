import { getCloudflareContext } from "@opennextjs/cloudflare";

export type RanchEmailAttachment = {
  content: string;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
};

export type RanchEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: RanchEmailAttachment[];
};

export type EmailSender = {
  send(message: RanchEmail): Promise<unknown>;
};

export function asEmailSender(value: unknown): EmailSender | undefined {
  if (
    value &&
    typeof value === "object" &&
    "send" in value &&
    typeof value.send === "function"
  ) {
    return value as EmailSender;
  }
  return undefined;
}

export async function getEmailSender(): Promise<EmailSender> {
  const { env } = await getCloudflareContext({ async: true });
  const sender = asEmailSender((env as { EMAIL?: unknown }).EMAIL);
  if (!sender) {
    throw new Error("EMAIL binding is missing");
  }
  return sender;
}

export async function sendRanchEmail(
  sender: EmailSender,
  message: RanchEmail,
): Promise<void> {
  await sender.send(message);
}
