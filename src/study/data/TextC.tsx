import { Entity, Location } from "../../model/Model";

export const textC = `Every winter, geese fly long distances and trade the freezing temperatures of the north for the warmth of the south. Robert was one of such geese and, as a goose, Robert doesn't ask many questions... But what is a human doing flying in the sky beside him?`

export const dataTextC : {locations: Location[], entities: Entity[], actions: any[]} = {
    locations: [
        {
            "name": "Open Skies",
            "emoji": "☁️"
        },
    ],
    entities: [
        {
            "name": "Robert",
            "emoji": "🦢",
            "properties": [
                {
                    "name": "curious",
                    "value": 7
                },
                {
                    "name": "adventurous",
                    "value": 6
                },
                {
                    "name": "determined",
                    "value": 8
                }
            ]
        },
        {
            "name": "human",
            "emoji": "🧑",
            "properties": [
                {
                    "name": "mysterious",
                    "value": 9
                },
                {
                    "name": "unexpected",
                    "value": 8
                },
                {
                    "name": "intriguing",
                    "value": 7
                }
            ]
        },
        {
            name: 'geese',
            emoji: '🦢',
            properties: [
            ]
        }
    ],
    actions: [
        {
            "name": "fly long distances",
            "source": "geese",
            "target": "geese",
            "location": "unknown",
            "passage": "Every winter, geese fly long distances and trade the freezing temperatures of the north for the warmth of the south."
        },
        {
            "name": "trade freezing temperatures",
            "source": "geese",
            "target": "geese",
            "location": "unknown",
            "passage": "Every winter, geese fly long distances and trade the freezing temperatures of the north for the warmth of the south."
        },
        {
            "name": "flying",
            "source": "human",
            "target": "Robert",
            "location": "Open Skies",
            "passage": "But what is a human doing flying in the sky beside him?"
        }
    ]
};