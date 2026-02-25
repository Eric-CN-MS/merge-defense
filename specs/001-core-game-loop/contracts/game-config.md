# Game Config Contracts

## weapons.json 格式
每个武器等级一条记录，level 1 是唯一可购买的武器。

```json
[
  {
    "level": 1,
    "name": "木弓",
    "damage": 10,
    "attackSpeed": 1.5,
    "range": 200,
    "cost": 50,
    "iconPath": "textures/weapons/bow_lv1",
    "mergeTo": 2
  },
  {
    "level": 5,
    "name": "神圣炮台",
    "damage": 150,
    "attackSpeed": 0.8,
    "range": 400,
    "cost": 0,
    "iconPath": "textures/weapons/cannon_lv5",
    "mergeTo": null
  }
]
```

## waves.json 格式
波次编号从1开始，enemies 数组描述本波敌人构成。

```json
[
  {
    "waveNumber": 1,
    "prepTime": 15,
    "enemies": [
      { "enemyId": "normal_1", "count": 5, "lane": 1, "spawnInterval": 1.0 }
    ]
  },
  {
    "waveNumber": 5,
    "prepTime": 15,
    "enemies": [
      { "enemyId": "normal_2", "count": 8, "lane": 0, "spawnInterval": 0.8 },
      { "enemyId": "normal_2", "count": 8, "lane": 2, "spawnInterval": 0.8 },
      { "enemyId": "boss_1",   "count": 1, "lane": 1, "spawnInterval": 0.0 }
    ]
  }
]
```

## StorageManager API

```typescript
StorageManager.save(state: Partial<SaveData>): void
StorageManager.load(): SaveData
StorageManager.clear(): void

interface SaveData {
  bestWave: number;
  unlockedSkins: string[];
  selectedSkin: string;
  totalCoinsEarned: number;
}
```
