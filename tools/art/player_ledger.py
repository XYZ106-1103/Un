import json, sys
OUT = sys.argv[1]

def check(name, rows, w, h):
    assert len(rows) == h, (name, len(rows))
    for i, r in enumerate(rows):
        assert len(r) == w, (name, i, len(r), r)

# ---------------- Player 16x24 ----------------
P = {
  "k": "#1a1420", "h": "#3b2a2a", "H": "#5a4038", "s": "#f0c8a0", "S": "#c99474", "r": "#e08a7a",
  "c": "#d9a441", "C": "#a8732a", "d": "#6e4a1f", "w": "#f7e7b8", "m": "#3fa7a0", "M": "#2a716c",
  "b": "#c8414b", "B": "#8a2a33", "n": "#f0c8a0", "N": "#c99474",
}
down0 = [
"................",
"....kkkkkkkk....",
"...khhhhhhhhk...",
"..khhHHhhhhhhk..",
"..khHhhhhhhhhk..",
"..khhhhhhhhhhk..",
"..khhhhhhhhhhk..",
"..khssshhssshk..",
"..kssssssssssk..",
"..kssksssskssk..",
"..kssksssskssk..",
"..krsssSSsssrk..",
"...kSssssssSk...",
"...kdccccccdk...",
"..kccCccccCcck..",
".kccCccwcccCcck.",
".kcCccccccccCck.",
".kcCcccwccccCck.",
".ksCccccccccCmk.",
".kSCccccccccCMk.",
"..kCccccccccCk..",
"..kddddddddddk..",
"...kbbk..kbbk...",
"...kkkk..kkkk...",
]
up0 = [
"................",
"....kkkkkkkk....",
"...khhhhhhhhk...",
"..khhHHhhhhhhk..",
"..khHhhhhhhhhk..",
"..khhhhhhhhhhk..",
"..khhhhhhHhhhk..",
"..khhhhhhhhhhk..",
"..khhhhhhhhhhk..",
"..khhHhhhhhhhk..",
"..khhhhhhhhhhk..",
"..kkhhhhhhhhkk..",
"...kShhhhhhSk...",
"...kdCCCCCCdk...",
"..kcdCCCCCCdck..",
".kcccddddddccck.",
".kcCccccccccCck.",
".kcCccccccccCck.",
".kmCccccccccCsk.",
".kMCccccccccCSk.",
"..kCccccccccCk..",
"..kddddddddddk..",
"...kbbk..kbbk...",
"...kkkk..kkkk...",
]
right0 = [
"................",
".....kkkkkkk....",
"....khhhhhhhk...",
"...khhHHhhhhhk..",
"...khHhhhhhhhk..",
"...khhhhhhhhhk..",
"...khhhhhhhhhk..",
"...khhhhhssssk..",
"...khhhhsssssk..",
"...khhhhsssksk..",
"...khhhhsssksk..",
"...khhhsrsssSk..",
"....khhSsssSk...",
"....kdcccccdk...",
"...kccccccCCk...",
"...kcccwccCCk...",
"...kcCCccccCk...",
"...kcCnnccCCk...",
"...kcCNNccCCk...",
"...kCcccccCCk...",
"...kddddddddk...",
"....kbbk.kbbk...",
"....kbBk.kbBk...",
"....kkkk.kkkk...",
]
for n, rows in [("down0", down0), ("up0", up0), ("right0", right0)]:
    check(n, rows, 16, 24)

player = {
  "size": [16, 24],
  "origin": [8, 23],
  "palette": P,
  "parts": {
    "front-plant-l": {"at": [3, 22], "rows": ["kbBk", "kkkk"]},
    "front-plant-r": {"at": [9, 22], "rows": ["kbBk", "kkkk"]},
    "side-stride": {"at": [0, 21], "rows": ["...kbbk...kbbk..", "...kbBk...kbBk..", "...kkkk...kkkk.."]},
    "side-erase-feet": {"at": [0, 21], "rows": ["                ", "                ", "                "]},
    "side-pass": {"at": [0, 21], "rows": ["....kbbkkbbk....", "....kbBkkbBk....", "....kkkkkkkk...."]},
    "hand-swing-front": {"at": [6, 17], "rows": ["kN"]},
  },
  "frames": {
    "down-0": down0,
    "down-1": {"from": "down-0", "shift": [0, -1], "parts": ["front-plant-l"]},
    "down-2": {"from": "down-0", "shift": [0, -1], "parts": ["front-plant-r"]},
    "up-0": up0,
    "up-1": {"from": "up-0", "shift": [0, -1], "parts": ["front-plant-l"]},
    "up-2": {"from": "up-0", "shift": [0, -1], "parts": ["front-plant-r"]},
    "right-0": right0,
    "right-1": {"from": "right-0", "parts": ["side-erase-feet", "side-stride"]},
    "right-2": {"from": "right-0", "shift": [0, -1], "parts": ["side-erase-feet", "side-pass"]},
    "left-0": {"mirror": "right-0", "palette": {"n": "#3fa7a0", "N": "#2a716c"}},
    "left-1": {"mirror": "right-1", "palette": {"n": "#3fa7a0", "N": "#2a716c"}},
    "left-2": {"mirror": "right-2", "palette": {"n": "#3fa7a0", "N": "#2a716c"}},
  },
  "animations": {
    "idle-down": {"frames": ["down-0"], "rate": 1},
    "idle-up": {"frames": ["up-0"], "rate": 1},
    "idle-left": {"frames": ["left-0"], "rate": 1},
    "idle-right": {"frames": ["right-0"], "rate": 1},
    "walk-down": {"frames": ["down-1", "down-0", "down-2", "down-0"], "rate": 7},
    "walk-up": {"frames": ["up-1", "up-0", "up-2", "up-0"], "rate": 7},
    "walk-right": {"frames": ["right-1", "right-0", "right-2", "right-0"], "rate": 7},
    "walk-left": {"frames": ["left-1", "left-0", "left-2", "left-0"], "rate": 7},
  },
}

# ---------------- Ledger field sprite 16x20 ----------------
L = {"k": "#1a1420", "g": "#56704c", "G": "#3c5236", "p": "#e8e2d0", "P": "#b9ad90", "e": "#f7f4ea",
     "o": "#1a1420", "r": "#c8414b", "y": "#f2b24c", "l": "#3b2a2a"}
ledger0 = [
".........r......",
"...kkkkkkrkkk...",
"..kygggggggyPk..",
"..kgggggggggPk..",
"..kgggggggggPk..",
"..kggeoggeogPk..",
"..kggeoggeogPk..",
"..kgggggggggPk..",
"..kggggkkgggPk..",
"..kgggggggggPk..",
"..kgggyyygggPk..",
"..kgggGGGgggPk..",
"..kgggggggggPk..",
"..kGGGGGGGGGPk..",
"..kyGGGGGGGyPk..",
"...kkkkkkkkkk...",
"....kll..llk....",
"....kll..llk....",
"...kkkk..kkkk...",
"................",
]
check("ledger0", ledger0, 16, 20)
ledger = {
  "size": [16, 20],
  "palette": L,
  "parts": {
    "blink": {"at": [3, 5], "rows": ["ggggggggg", "ggkkggkkg"]},
    "look-l": {"at": [3, 5], "rows": ["goeggoegg", "goeggoegg"]},
  },
  "frames": {
    "idle-0": ledger0,
    "idle-1": {"from": "idle-0", "parts": ["blink"]},
    "idle-2": {"from": "idle-0", "parts": ["look-l"]},
    "idle-3": {"from": "idle-0", "shift": [0, -1]},
  },
  "animations": {
    "idle": {"frames": ["idle-0", "idle-0", "idle-3", "idle-0", "idle-0", "idle-1", "idle-0", "idle-2", "idle-2", "idle-0"], "rate": 3},
  },
}

json.dump(player, open(f"{OUT}/player.json", "w"), indent=1)
json.dump(ledger, open(f"{OUT}/ledger.json", "w"), indent=1)
print("ok")
