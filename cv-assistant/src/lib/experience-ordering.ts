type TimestampLike = string | Date | undefined | null;

export type ExperienceOrderingMetadata = {
  normalizedTimeTo: string;
  normalizedTimeToSortKey: number | null;
  normalizedTimeToIsPresent: boolean;
  normalizedTimeToSource: string;
};

export type SortableExperienceLike = Partial<ExperienceOrderingMetadata> & {
  timeFrom?: string;
  timeTo?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
};

const PRESENT_PATTERN = /^(present|current|now|ongoing|today)$/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/* Motivation vs Logic:
   Motivation: experience cards need one shared recency rule so backend persistence and client hydration agree on which role should become Experience 01.
   Logic: preserve the user-entered timeline strings for display, derive hidden sortable metadata from flexible date formats, and centralize the comparison logic in one reusable utility. */
function cleanTimelineValue(value?: string) {
  return (value || '').trim();
}

function padTwo(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeYear(value: number, digits: number) {
  if (digits >= 4) {
    return value;
  }

  return value >= 70 ? 1900 + value : 2000 + value;
}

function isValidDateParts(day: number, month: number, year: number) {
  if (month < 1 || month > 12 || day < 1 || year < 0) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function buildMetadata(day: number, month: number, year: number): ExperienceOrderingMetadata {
  return {
    normalizedTimeTo: `${padTwo(day)}/${padTwo(month)}/${padTwo(year % 100)}`,
    normalizedTimeToSortKey: year * 10000 + month * 100 + day,
    normalizedTimeToIsPresent: false,
    normalizedTimeToSource: '',
  };
}

function tokenizeDate(value: string) {
  return value
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[,\u2013\u2014]+/g, ' ')
    .replace(/[./-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function parseNumericDate(tokens: string[]): ExperienceOrderingMetadata | null {
  if (!tokens.every((token) => /^\d+$/.test(token))) {
    return null;
  }

  if (tokens.length === 1) {
    const rawYear = Number(tokens[0]);
    const year = normalizeYear(rawYear, tokens[0].length);
    return isValidDateParts(1, 1, year) ? buildMetadata(1, 1, year) : null;
  }

  if (tokens.length === 2) {
    const [first, second] = tokens;
    let month = Number(first);
    let rawYear = Number(second);
    let yearDigits = second.length;

    if (first.length === 4) {
      rawYear = Number(first);
      month = Number(second);
      yearDigits = first.length;
    }

    const year = normalizeYear(rawYear, yearDigits);
    return isValidDateParts(1, month, year) ? buildMetadata(1, month, year) : null;
  }

  if (tokens.length === 3) {
    const [first, second, third] = tokens;
    let day: number;
    let month: number;
    let rawYear: number;
    let yearDigits: number;

    if (first.length === 4) {
      rawYear = Number(first);
      yearDigits = first.length;
      month = Number(second);
      day = Number(third);
    } else {
      rawYear = Number(third);
      yearDigits = third.length;

      const firstNumber = Number(first);
      const secondNumber = Number(second);

      if (firstNumber > 12 && secondNumber <= 12) {
        day = firstNumber;
        month = secondNumber;
      } else if (secondNumber > 12 && firstNumber <= 12) {
        month = firstNumber;
        day = secondNumber;
      } else {
        day = firstNumber;
        month = secondNumber;
      }
    }

    const year = normalizeYear(rawYear, yearDigits);
    return isValidDateParts(day, month, year) ? buildMetadata(day, month, year) : null;
  }

  return null;
}

function parseAlphabeticDate(tokens: string[]): ExperienceOrderingMetadata | null {
  const monthIndex = tokens.findIndex((token) => token in MONTHS);
  if (monthIndex < 0) {
    return null;
  }

  const month = MONTHS[tokens[monthIndex]];
  const numericParts = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ index, token }) => index !== monthIndex && /^\d+$/.test(token));

  if (numericParts.length === 0) {
    return null;
  }

  let day = 1;
  let yearToken = '';

  if (numericParts.length === 1) {
    yearToken = numericParts[0].token;
  } else {
    const explicitYear = numericParts.find(({ token }) => token.length === 4 || Number(token) > 31);

    if (explicitYear) {
      yearToken = explicitYear.token;
      const dayCandidate = numericParts.find(({ token }) => token !== explicitYear.token);
      day = dayCandidate ? Number(dayCandidate.token) : 1;
    } else if (monthIndex === 0 || monthIndex === tokens.length - 1) {
      day = Number(numericParts[0].token);
      yearToken = numericParts[numericParts.length - 1].token;
    } else {
      const beforeMonth = numericParts.filter(({ index }) => index < monthIndex);
      const afterMonth = numericParts.filter(({ index }) => index > monthIndex);
      yearToken = afterMonth[afterMonth.length - 1]?.token || beforeMonth[0]?.token || numericParts[numericParts.length - 1].token;
      const dayToken = beforeMonth[beforeMonth.length - 1]?.token || afterMonth[0]?.token;
      day = dayToken ? Number(dayToken) : 1;
    }
  }

  const rawYear = Number(yearToken);
  const year = normalizeYear(rawYear, yearToken.length);
  return isValidDateParts(day, month, year) ? buildMetadata(day, month, year) : null;
}

export function parseExperienceDate(value?: string): ExperienceOrderingMetadata {
  const cleaned = cleanTimelineValue(value);
  if (!cleaned) {
    return {
      normalizedTimeTo: '',
      normalizedTimeToSortKey: null,
      normalizedTimeToIsPresent: false,
      normalizedTimeToSource: '',
    };
  }

  if (PRESENT_PATTERN.test(cleaned)) {
    return {
      normalizedTimeTo: '',
      normalizedTimeToSortKey: null,
      normalizedTimeToIsPresent: true,
      normalizedTimeToSource: '',
    };
  }

  const tokens = tokenizeDate(cleaned);
  return parseAlphabeticDate(tokens) || parseNumericDate(tokens) || {
    normalizedTimeTo: '',
    normalizedTimeToSortKey: null,
    normalizedTimeToIsPresent: false,
    normalizedTimeToSource: '',
  };
}

export function deriveExperienceOrderingMetadata(
  experience: Pick<SortableExperienceLike, 'timeFrom' | 'timeTo'>,
): ExperienceOrderingMetadata {
  const timeTo = cleanTimelineValue(experience.timeTo);
  const source: ExperienceOrderingMetadata['normalizedTimeToSource'] = timeTo ? 'timeTo' : 'timeFrom';
  const parsed = parseExperienceDate(timeTo || cleanTimelineValue(experience.timeFrom));

  return {
    ...parsed,
    normalizedTimeToSource:
      parsed.normalizedTimeToIsPresent || parsed.normalizedTimeToSortKey !== null ? source : '',
  };
}

function toTimestamp(value: TimestampLike) {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.valueOf();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readOrderingMetadata(experience: SortableExperienceLike): ExperienceOrderingMetadata {
  const hasStoredMetadata =
    typeof experience.normalizedTimeTo === 'string' ||
    typeof experience.normalizedTimeToSortKey === 'number' ||
    typeof experience.normalizedTimeToIsPresent === 'boolean';

  if (!hasStoredMetadata) {
    return deriveExperienceOrderingMetadata(experience);
  }

  return {
    normalizedTimeTo: experience.normalizedTimeTo || '',
    normalizedTimeToSortKey:
      typeof experience.normalizedTimeToSortKey === 'number' ? experience.normalizedTimeToSortKey : null,
    normalizedTimeToIsPresent: Boolean(experience.normalizedTimeToIsPresent),
    normalizedTimeToSource:
      experience.normalizedTimeToSource === 'timeTo' || experience.normalizedTimeToSource === 'timeFrom'
        ? experience.normalizedTimeToSource
        : '',
  };
}

export function compareExperiencesByRecency(
  left: SortableExperienceLike,
  right: SortableExperienceLike,
) {
  const leftMetadata = readOrderingMetadata(left);
  const rightMetadata = readOrderingMetadata(right);

  if (leftMetadata.normalizedTimeToIsPresent !== rightMetadata.normalizedTimeToIsPresent) {
    return leftMetadata.normalizedTimeToIsPresent ? -1 : 1;
  }

  const leftHasConcreteDate = leftMetadata.normalizedTimeToSortKey !== null;
  const rightHasConcreteDate = rightMetadata.normalizedTimeToSortKey !== null;

  if (leftHasConcreteDate !== rightHasConcreteDate) {
    return leftHasConcreteDate ? -1 : 1;
  }

  if (
    leftMetadata.normalizedTimeToSortKey !== null &&
    rightMetadata.normalizedTimeToSortKey !== null &&
    leftMetadata.normalizedTimeToSortKey !== rightMetadata.normalizedTimeToSortKey
  ) {
    return rightMetadata.normalizedTimeToSortKey - leftMetadata.normalizedTimeToSortKey;
  }

  const updatedAtDifference = toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
  if (updatedAtDifference !== 0) {
    return updatedAtDifference;
  }

  return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
}

export function sortExperiencesByRecency<T extends SortableExperienceLike>(items: T[]) {
  return [...items].sort(compareExperiencesByRecency);
}
