import { messagingApi, validateSignature } from "@line/bot-sdk";

const { MessagingApiClient } = messagingApi;

let client: InstanceType<typeof MessagingApiClient> | null = null;

function getClient(): InstanceType<typeof MessagingApiClient> {
  if (!client) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    }
    client = new MessagingApiClient({ channelAccessToken });
  }
  return client;
}

export function verifySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || !signature) return false;

  try {
    return validateSignature(rawBody, channelSecret, signature);
  } catch {
    return false;
  }
}

export async function replyText(
  replyToken: string,
  text: string,
): Promise<void> {
  await getClient().replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}
