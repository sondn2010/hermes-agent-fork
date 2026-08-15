import { type CSSProperties, useState } from 'react'

import { capitalize, normalize } from '@/lib/text'

import introCopyJsonl from './intro-copy.jsonl?raw'

type IntroCopy = {
  headline: string
  body: string
}

type IntroCopyRecord = IntroCopy & {
  personality: string
}

export type IntroProps = {
  personality?: string
  seed?: number
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

const FALLBACK_COPY: IntroCopy[] = [
  {
    headline: 'Hôm nay chúng ta sẽ làm gì?',
    body: 'Gửi một bug, nhánh, kế hoạch hoặc ý tưởng sơ lược. Tôi sẽ kiểm tra repo và chuyển nó thành bước đi cụ thể tiếp theo.'
  },
  {
    headline: 'Bạn đang nghĩ gì thế?',
    body: 'Hãy mang code, câu hỏi hoặc phần bị tắc lại đây. Tôi sẽ tìm hiểu kỹ bối cảnh trước khi thực hiện thay đổi.'
  },
  {
    headline: 'Hermes nên xem xét phần nào?',
    body: 'Gửi nhiệm vụ, đường dẫn lỗi hoặc kế hoạch dở dang. Tôi sẽ giúp biến nó thành hành động.'
  },
  {
    headline: 'Chúng ta nên bắt đầu từ đâu?',
    body: 'Hãy đưa vấn đề, mục tiêu hoặc file. Tôi sẽ kiểm tra trước và đề xuất bước đi cụ thể tiếp theo.'
  },
  {
    headline: 'Phần nào cần chú ý?',
    body: 'Gửi bối cảnh bạn đang có. Tôi sẽ giúp phân loại nó thành kế hoạch hoặc phương án sửa lỗi.'
  }
]

function normalizeKey(value?: string): string {
  return normalize(value)
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ')
}

function isIntroCopyRecord(value: unknown): value is IntroCopyRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.personality === 'string' &&
    typeof record.headline === 'string' &&
    typeof record.body === 'string' &&
    Boolean(record.personality.trim()) &&
    Boolean(record.headline.trim()) &&
    Boolean(record.body.trim())
  )
}

function parseIntroCopy(raw: string): Record<string, IntroCopy[]> {
  const byPersonality: Record<string, IntroCopy[]> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (!isIntroCopyRecord(parsed)) {
        continue
      }

      const key = normalizeKey(parsed.personality)
      byPersonality[key] ??= []
      byPersonality[key].push({
        headline: parsed.headline.trim(),
        body: parsed.body.trim()
      })
    } catch {
      // Bad generated copy should not break the whole desktop app.
    }
  }

  return byPersonality
}

const INTRO_COPY_BY_PERSONALITY = parseIntroCopy(introCopyJsonl)

function neutralCopy(): IntroCopy[] {
  return INTRO_COPY_BY_PERSONALITY.none || INTRO_COPY_BY_PERSONALITY.default || FALLBACK_COPY
}

function fallbackCopyForPersonality(personalityKey: string): IntroCopy[] {
  if (NEUTRAL_PERSONALITIES.has(personalityKey)) {
    return neutralCopy()
  }

  const label = titleize(personalityKey)

  return [
    {
      headline: `Đang bật chế độ ${label}. Chúng ta nên làm gì?`,
      body: "Gửi nhiệm vụ, file hoặc ý tưởng sơ lược. Tôi sẽ sử dụng giọng điệu bạn cấu hình và giữ công việc bám sát repo này."
    },
    {
      headline: `${label} Hermes cần xem xét phần nào?`,
      body: "Hãy đưa bối cảnh hoặc phần bị tắc. Tôi sẽ điều chỉnh theo personality bạn đã cấu hình."
    },
    {
      headline: `Chế độ ${label} đã sẵn sàng.`,
      body: "Gửi vấn đề, file hoặc ý tưởng. Tôi sẽ làm theo personality bạn đã cấu hình."
    },
    {
      headline: `${label} Hermes nên giải quyết phần nào?`,
      body: "Thả nhiệm vụ ở đây. Tôi sẽ giữ công việc bám sát repo."
    },
    {
      headline: 'Chúng ta nên bắt đầu từ đâu?',
      body: `Đưa bối cảnh cho tôi và tôi sẽ trả lời trong chế độ ${label}.`
    }
  ]
}

function pickCopy(copies: IntroCopy[], seed = 0): IntroCopy {
  return copies[Math.abs(seed) % copies.length] || FALLBACK_COPY[0]
}

const WORDMARK = 'CNCNS AGENT'

function resolveCopy(personality?: string, seed?: number): IntroCopy {
  const personalityKey = normalizeKey(personality)

  const copies = NEUTRAL_PERSONALITIES.has(personalityKey)
    ? INTRO_COPY_BY_PERSONALITY[personalityKey] || neutralCopy()
    : INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)

  return pickCopy(copies, seed)
}

export function Intro({ personality, seed }: IntroProps) {
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const copy = resolveCopy(personality, mountSeed + (seed ?? 0))

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <p
          aria-label={WORDMARK}
          className="fit-text mx-auto mb-1 w-[calc(100%-1rem)] font-['Collapse'] font-bold uppercase leading-[0.9] tracking-[0.08em] text-midground mix-blend-plus-lighter dark:text-foreground/90"
          style={{ '--fit-min': '2.75rem' } as CSSProperties}
        >
          <span>
            <span>{WORDMARK}</span>
          </span>
          <span aria-hidden="true">{WORDMARK}</span>
        </p>

        <p className="m-0 text-center leading-normal tracking-tight">{copy.body}</p>
      </div>
    </div>
  )
}
