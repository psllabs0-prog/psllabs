import {
  DISCORD_ALLOWED_MENTIONS,
  sanitizeDiscordInput,
} from "./sanitize";
import {
  answerAsk,
  answerCoa,
  answerProducts,
  answerShipping,
  answerSupport,
  type DiscordAnswer,
} from "./answers";
import { isDiscordTestMode } from "./config";
import {
  checkDiscordRateLimit,
  hashDiscordUserId,
  recordDiscordInteraction,
} from "./store";

export const DISCORD_V1_COMMANDS = [
  {
    name: "ask",
    description: "Ask a general public PSL Labs factual question",
    options: [
      {
        type: 3,
        name: "question",
        description: "Your question",
        required: true,
      },
    ],
  },
  {
    name: "coa",
    description: "Where to find and verify batch / COA documentation",
    options: [
      {
        type: 3,
        name: "product_or_batch",
        description: "Optional product or batch hint",
        required: false,
      },
    ],
  },
  {
    name: "products",
    description: "Current public sellable product availability and pricing",
    options: [
      {
        type: 3,
        name: "product",
        description: "Optional product name filter",
        required: false,
      },
    ],
  },
  {
    name: "shipping",
    description: "Current approved PSL Labs shipping policy",
    options: [],
  },
  {
    name: "support",
    description: "How to contact PSL Labs Support privately",
    options: [],
  },
] as const;

type DiscordInteraction = {
  id?: string;
  type?: number;
  data?: {
    name?: string;
    options?: Array<{ name?: string; value?: string | number | boolean }>;
  };
  member?: { user?: { id?: string } };
  user?: { id?: string };
};

function optionValue(
  interaction: DiscordInteraction,
  name: string
): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  if (opt?.value == null) return undefined;
  return sanitizeDiscordInput(String(opt.value));
}

function channelMessage(answer: DiscordAnswer) {
  return {
    type: 4,
    data: {
      content: answer.content.slice(0, 1900),
      flags: answer.ephemeral ? 64 : 0,
      allowed_mentions: { ...DISCORD_ALLOWED_MENTIONS },
    },
  };
}

export async function handleDiscordApplicationCommand(
  interaction: DiscordInteraction
): Promise<Record<string, unknown>> {
  const command = (interaction.data?.name ?? "").toLowerCase();
  const interactionId = String(interaction.id ?? "");
  const userId =
    interaction.member?.user?.id ?? interaction.user?.id ?? "";
  const userHash = hashDiscordUserId(userId);

  const rate = await checkDiscordRateLimit(userHash);
  if (!rate.allowed) {
    if (interactionId) {
      await recordDiscordInteraction({
        discordInteractionId: interactionId,
        command,
        category: "rate_limited",
        riskLevel: "low",
        outcome: "rate_limited",
        responseSource: "rate_limit",
        reportingExcluded: true,
        userHash,
      });
    }
    return channelMessage({
      content:
        "You're sending commands a bit quickly. Please wait a minute and try again.",
      ephemeral: true,
      category: "rate_limited",
      riskLevel: "low",
      outcome: "uncertain",
      responseSource: "rate_limit",
    });
  }

  let answer: DiscordAnswer;
  switch (command) {
    case "ask":
      answer = answerAsk(optionValue(interaction, "question") ?? "");
      break;
    case "coa":
      answer = answerCoa(optionValue(interaction, "product_or_batch"));
      break;
    case "products":
      answer = await answerProducts(optionValue(interaction, "product"));
      break;
    case "shipping":
      answer = answerShipping();
      break;
    case "support":
      answer = answerSupport();
      break;
    default:
      answer = {
        content: "Unknown command.",
        ephemeral: true,
        category: "unknown",
        riskLevel: "low",
        outcome: "uncertain",
        responseSource: "fixed:unknown",
      };
  }

  if (interactionId) {
    await recordDiscordInteraction({
      discordInteractionId: interactionId,
      command,
      category: answer.category,
      riskLevel: answer.riskLevel,
      outcome: answer.outcome,
      responseSource: answer.responseSource,
      reportingExcluded: isDiscordTestMode(),
      userHash,
    });
  }

  return channelMessage(answer);
}
