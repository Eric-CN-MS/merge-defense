import json, sys

scene = r"C:\Users\eric\projects\merge-defense\assets\scene.scene"
with open(scene, "r", encoding="utf-8-sig") as f:
    data = json.load(f)

changed = 0
for obj in data:
    if obj.get("_name") == "GridContainer" and "_lpos" in obj:
        old = obj["_lpos"]["x"]
        obj["_lpos"]["x"] = -80
        print(f"GridContainer._lpos.x: {old} -> -80")
        changed += 1

with open(scene, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(f"完成，修改 {changed} 处")
