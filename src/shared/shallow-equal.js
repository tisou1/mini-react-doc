// memo / PureComponent 只比较第一层，嵌套对象需要保持引用稳定。
export function shallowEqual(previous, next) {
  if (Object.is(previous, next)) return true;
  if (
    previous === null || next === null ||
    typeof previous !== 'object' || typeof next !== 'object'
  ) return false;

  const keys = Object.keys(previous);
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every(key =>
    Object.prototype.hasOwnProperty.call(next, key) &&
    Object.is(previous[key], next[key])
  );
}
