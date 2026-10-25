export function sameRecording(a, b) {
  return a.id === b.id || Boolean(a.r2Key && a.r2Key === b.r2Key);
}

export function copyFileCategory(item, source) {
  const { section: _section, normalization: _normalization, ...rest } = item;
  return {
    ...rest,
    category: source.category,
    ...(source.section !== undefined ? { section: source.section } : {}),
    ...(source.normalization !== undefined ? { normalization: source.normalization } : {}),
  };
}

export function syncStudentFileCategories(data) {
  if (!data || !Array.isArray(data.students)) return data;
  const files = Object.values(data.parashaLibrary || {}).flat();
  const byId = new Map(files.map((item) => [item.id, item]));
  const byKey = new Map(files.filter((item) => item.r2Key).map((item) => [item.r2Key, item]));
  return {
    ...data,
    students: data.students.map((student) => ({
      ...student,
      ...(Array.isArray(student.portions) ? {
        portions: student.portions.map((item) => {
          const source = byId.get(item.id) || (item.r2Key && byKey.get(item.r2Key));
          return source ? copyFileCategory(item, source) : item;
        }),
      } : {}),
    })),
  };
}
