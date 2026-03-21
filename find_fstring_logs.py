import os
import ast

def find_fstring_logger_calls(directory):
    count = 0
    results = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".py"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        tree = ast.parse(f.read(), filename=path)
                    
                    for node in ast.walk(tree):
                        if isinstance(node, ast.Call):
                            if isinstance(node.func, ast.Attribute):
                                if isinstance(node.func.value, ast.Name) and node.func.value.id == "logger":
                                    if node.func.attr in ["info", "debug", "warning", "error", "exception"]:
                                        # Check if any argument is a JoinedStr (f-string)
                                        has_fstring = False
                                        for arg in node.args:
                                            if isinstance(arg, ast.JoinedStr):
                                                has_fstring = True
                                                break
                                        
                                        if has_fstring:
                                            count += 1
                                            # Get the source line
                                            results.append({
                                                "file": os.path.abspath(path),
                                                "line": node.lineno,
                                                "call": ast.get_source_segment(open(path).read(), node) if hasattr(ast, "get_source_segment") else "Source not available"
                                            })
                except Exception as e:
                    # print(f"Error parsing {path}: {e}")
                    pass
    return results, count

results, total = find_fstring_logger_calls("src-tauri/python/portfolio_src")
for res in results:
    # Clean up multiline calls for display
    call_display = res['call'].replace('\n', ' ').replace('    ', ' ')
    print(f"{res['file']}:{res['line']}: {call_display}")
print(f"TOTAL_COUNT: {total}")
