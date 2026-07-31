import re
import pathlib
import sys

BASE = pathlib.Path('/home/ubuntu/repos/go-admin-erp/src')
TARGET_DIRS = [
    BASE / 'app' / 'app' / 'pos' / 'comandas',
    BASE / 'app' / 'app' / 'transporte',
    BASE / 'app' / 'app' / 'organizacion',
    BASE / 'components' / 'transporte',
    BASE / 'components' / 'pos' / 'comandas',
    BASE / 'components' / 'organization',
]


def split_classes(cls: str):
    """Split a class string into common, light-specific and dark-specific tokens."""
    tokens = cls.split()
    common = []
    light = []
    dark = []
    for t in tokens:
        if t.startswith('dark:'):
            dark.append(t[5:])
        elif t.startswith('light:'):
            light.append(t[7:])
        else:
            common.append(t)
    return common, light, dark


def build_expr(common: list, light: list, dark: list) -> str:
    common_s = ' '.join(common)
    light_s = ' '.join(light)
    dark_s = ' '.join(dark)

    # Build a JS expression that uses tc(light, dark)
    if not light_s and not dark_s:
        # No theme-specific classes, keep as literal string
        return f'"{common_s}"'

    # Escape backticks in class strings to avoid breaking template literals
    common_s = common_s.replace('`', '\\`')
    light_s = light_s.replace('`', '\\`')
    dark_s = dark_s.replace('`', '\\`')

    if not common_s:
        return f"{{tc(\"{light_s}\", \"{dark_s}\")}}"
    return f"{{`{common_s} ${{tc(\"{light_s}\", \"{dark_s}\")}}`}}"


def transform_literal_classname(match: re.Match) -> str:
    prefix = match.group(1)  # e.g. 'className='
    quote = match.group(2)
    cls = match.group(3)
    common, light, dark = split_classes(cls)
    if not light and not dark:
        return match.group(0)
    return f"{prefix}{build_expr(common, light, dark)}"


def transform_string_argument(s: str) -> str:
    quote = s[0]
    cls = s[1:-1]
    common, light, dark = split_classes(cls)
    if not light and not dark:
        return s
    new_expr = build_expr(common, light, dark)
    # cn arguments need to be JS expressions, not JSX attribute style.
    # build_expr returns either {`... ${...}`} or {tc(...)} or "..."
    # Remove surrounding { } for cn argument.
    if new_expr.startswith('{') and new_expr.endswith('}'):
        new_expr = new_expr[1:-1]
    return new_expr


def transform_cn_call(match: re.Match) -> str:
    inner = match.group(1)
    # Find string arguments in the cn call and transform them.
    # We only transform string literals that contain dark:
    def repl(arg_match: re.Match) -> str:
        arg = arg_match.group(0)
        if 'dark:' not in arg and 'light:' not in arg:
            return arg
        if (arg.startswith('"') and arg.endswith('"')) or (arg.startswith("'") and arg.endswith("'")):
            return transform_string_argument(arg)
        return arg
    new_inner = re.sub(r'"([^"]*?)"|\'([^\']*?)\'', repl, inner)
    if new_inner == inner:
        return match.group(0)
    return f"cn({new_inner})"


def transform_template_literal(match: re.Match) -> str:
    content = match.group(1)
    # Only handle template literals that do not contain interpolations
    if '${' in content:
        return match.group(0)
    common, light, dark = split_classes(content)
    if not light and not dark:
        return match.group(0)
    # We already have a template literal, just inject tc into it.
    common_s = ' '.join(common).replace('`', '\\`')
    light_s = ' '.join(light).replace('`', '\\`')
    dark_s = ' '.join(dark).replace('`', '\\`')
    if not light_s and not dark_s:
        return match.group(0)
    if not common_s:
        return f"{{tc(\"{light_s}\", \"{dark_s}\")}}"
    return f"{{`{common_s} ${{tc(\"{light_s}\", \"{dark_s}\")}}`}}"


def insert_import(text: str) -> str:
    if 'useThemeClasses' in text:
        return text
    # find 'use client' line
    m = re.search(r"^'use client';?\s*\n", text, re.MULTILINE)
    if m:
        insert_pos = m.end()
        return text[:insert_pos] + "import { useThemeClasses } from '@/lib/theme';\n" + text[insert_pos:]
    # otherwise prepend
    return "import { useThemeClasses } from '@/lib/theme';\n" + text


def insert_tc_in_functions(text: str) -> str:
    # Insert `const { tc } = useThemeClasses();` after the opening brace of each exported function.
    pattern = re.compile(
        r"(export\s+(?:default\s+)?function\s+\w+\s*\([^)]*\)\s*\{)"
    )
    # We insert after the first exported function only if tc is not already present.
    if 'const { tc } = useThemeClasses' in text:
        return text
    m = pattern.search(text)
    if not m:
        return text
    return text[:m.end()] + "\n  const { tc } = useThemeClasses();" + text[m.end():]


def process_file(path: pathlib.Path) -> tuple:
    text = path.read_text()
    original = text
    # Only process client components
    if "'use client'" not in text[:300]:
        return False, 'not client'

    # 1. className="..."
    text = re.sub(r'(className=)"([^"]*(?:dark:|light:)[^"]*)"', transform_literal_classname, text)
    # 2. className='...'
    text = re.sub(r"(className=)'([^']*(?:dark:|light:)[^']*)'", transform_literal_classname, text)
    # 3. className={cn("...", ...)} only transform string arguments
    text = re.sub(r'className=\{cn\((.*?)\)\}', transform_cn_call, text, flags=re.DOTALL)
    # 4. className={`...`} simple (no ${})
    text = re.sub(r'className=\{`([^`]*(?:dark:|light:)[^`]*)`\}', transform_template_literal, text)

    if text == original:
        return False, 'no dark: changes'

    text = insert_import(text)
    text = insert_tc_in_functions(text)
    path.write_text(text)
    return True, 'ok'


def main():
    files = []
    for d in TARGET_DIRS:
        if d.exists():
            files.extend(d.rglob('*.tsx'))

    stats = {'processed': 0, 'skipped': 0, 'reasons': {}}
    for f in files:
        ok, reason = process_file(f)
        if ok:
            stats['processed'] += 1
            print(f'Processed {f}')
        else:
            stats['skipped'] += 1
            stats['reasons'][reason] = stats['reasons'].get(reason, 0) + 1
    print(stats)


if __name__ == '__main__':
    main()
