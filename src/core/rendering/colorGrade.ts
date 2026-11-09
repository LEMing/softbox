export interface ColorGrade {
  contrast: number;
  saturation: number;
}

const DEFAULT_COLOR_GRADE: ColorGrade = { contrast: 0.12, saturation: 0.15 };

export function resolveColorGrade(raw: unknown): ColorGrade | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === true) {
    return { ...DEFAULT_COLOR_GRADE };
  }
  if (typeof raw === 'object') {
    const grade = raw as Partial<ColorGrade>;
    return {
      contrast: grade.contrast ?? DEFAULT_COLOR_GRADE.contrast,
      saturation: grade.saturation ?? DEFAULT_COLOR_GRADE.saturation,
    };
  }
  return undefined;
}
