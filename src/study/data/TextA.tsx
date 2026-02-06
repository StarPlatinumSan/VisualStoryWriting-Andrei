import { Entity, Location } from "../../model/Model";

export const textA = `Julia sat at a small table outside the café stirring her coffee absentmindedly. The young waitress clumsily cleared the table next to her, making her remember when she was the young ambitious waitress who just moved to the big city. She wondered where this young waitress came from and what the gossip amongst the staff of this café was.
Sam’s alarm blared at full volume through her phone speakers. As she reached her arm out to press snooze for the third time, she suddenly remembered. The pounding of her heart grew louder and louder as she peeked at her phone – 10:05.
“Oh no,” she muttered as she scrambled out of bed. She had set 5 alarms and yet, she was still in bed.
"omw!" She texted Julia, feeling a pang of guilt.
 
CLANG
The waiter apologized as she bumped into Julia.
“Um, is there anything I can get for you?”
“It’s ok. I’m good, thanks,” Julia said before giving a polite smile. Her phone buzzed with a message from Sam which read exactly what she expected.
 
Sam ran to the bathroom, cursing herself for never being able to wake up to her alarms. Her hair was a mess but there was no time to do anything about it. She grabbed her bag from her room then sprinted through the streets. Guilt gnawing at her conscience, she hoped she wouldn’t be too too late.
 
“Would you like another cup of coffee?” The waiter asked, pointing to the cup. The table next to Julia had cleared once again.
Julia thought for a second before nodding. “Sure.”
She pulled out her phone, looking at Sam’s text from 30 minutes ago.
 
At 10:55, Julia sighed and took a sip of her second cup of lukewarm coffee. She could picture Sam running out her door, hair all over, panicking while checking the time. Julia tried not to be annoyed but this was not the first time. Or the second. She leaned back in her chair, debating whether to order breakfast alone or wait a little longer. Across the street, Sam sees Julia sitting at the front of the café.`

export const dataTextA : {locations: Location[], entities: Entity[], actions: any[]} = {
    locations: [
        {
            "name": "Café",
            "emoji": "☕"
        },
        {
            "name": "Sam's Bedroom",
            "emoji": "🛏️"
        },
        {
            "name": "Sam's Bathroom",
            "emoji": "🚽"
        },
        {
            "name": "Street",
            "emoji": "🏃‍♀️"
        }
    ],
    entities: [
        {
            "name": "Julia",
            "emoji": "👩",
            "properties": [
                {
                    "name": "patient",
                    "value": 7
                },
                {
                    "name": "nostalgic",
                    "value": 6
                },
                {
                    "name": "polite",
                    "value": 8
                }
            ]
        },
        {
            "name": "Sam",
            "emoji": "🙋‍♀️",
            "properties": [
                {
                    "name": "forgetful",
                    "value": 8
                },
                {
                    "name": "rushed",
                    "value": 9
                },
                {
                    "name": "guilty",
                    "value": 7
                }
            ]
        },
        {
            "name": "Waitress",
            "emoji": "👩‍🍳",
            "properties": [
                {
                    "name": "clumsy",
                    "value": 6
                },
                {
                    "name": "young",
                    "value": 5
                }
            ]
        },
        {
            "name": "Bag",
            "emoji": "🎒",
            "properties": [
                {
                    "name": "heavy",
                    "value": 5
                },
                {
                    "name": "forgotten",
                    "value": 6
                }
            ]
        },
        {
            "name": "Alarm",
            "emoji": "⏰",
            "properties": [
                {
                    "name": "loud",
                    "value": 9
                },
                {
                    "name": "ignored",
                    "value": 8
                }
            ]
        }
    ],
    actions: [
        {
            "name": "sat",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "Julia sat at a small table outside the café stirring her coffee absentmindedly."
        },
        {
            "name": "stirring coffee",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "Julia sat at a small table outside the café stirring her coffee absentmindedly."
        },
        {
            "name": "cleared table",
            "source": "Waitress",
            "target": "Waitress",
            "location": "Café",
            "passage": "The young waitress clumsily cleared the table next to her, making her remember when she was the young ambitious waitress who just moved to the big city."
        },
        {
            "name": "blared",
            "source": "Alarm",
            "target": "Sam",
            "location": "unknown",
            "passage": "Sam’s alarm blared at full volume through her phone speakers."
        },
        {
            "name": "reached out",
            "source": "Sam",
            "target": "Alarm",
            "location": "unknown",
            "passage": "As she reached her arm out to press snooze for the third time, she suddenly remembered."
        },
        {
            "name": "press snooze",
            "source": "Sam",
            "target": "Alarm",
            "location": "unknown",
            "passage": "As she reached her arm out to press snooze for the third time, she suddenly remembered."
        },
        {
            "name": "peeked at phone",
            "source": "Sam",
            "target": "Phone",
            "location": "unknown",
            "passage": "The pounding of her heart grew louder and louder as she peeked at her phone – 10:05."
        },
        {
            "name": "muttered",
            "source": "Sam",
            "target": "Sam",
            "location": "unknown",
            "passage": "“Oh no,” she muttered as she scrambled out of bed."
        },
        {
            "name": "scrambled out",
            "source": "Sam",
            "target": "Sam",
            "location": "unknown",
            "passage": "“Oh no,” she muttered as she scrambled out of bed."
        },
        {
            "name": "set alarms",
            "source": "Sam",
            "target": "Alarm",
            "location": "unknown",
            "passage": "She had set 5 alarms and yet, she was still in bed.\nomw!"
        },
        {
            "name": "be in bed",
            "source": "Sam",
            "target": "Sam",
            "location": "unknown",
            "passage": "She had set 5 alarms and yet, she was still in bed.\nomw!"
        },
        {
            "name": "texted",
            "source": "Sam",
            "target": "Julia",
            "location": "unknown",
            "passage": "She texted Julia, feeling a pang of guilt."
        },
        {
            "name": "bumped into",
            "source": "Waitress",
            "target": "Julia",
            "location": "Café",
            "passage": "CLANG\nThe waiter apologized as she bumped into Julia."
        },
        {
            "name": "apologized",
            "source": "Waitress",
            "target": "Julia",
            "location": "Café",
            "passage": "CLANG\nThe waiter apologized as she bumped into Julia."
        },
        {
            "name": "said",
            "source": "Julia",
            "target": "Waitress",
            "location": "Café",
            "passage": "I’m good, thanks,” Julia said before giving a polite smile."
        },
        {
            "name": "smile",
            "source": "Julia",
            "target": "Waitress",
            "location": "Café",
            "passage": "I’m good, thanks,” Julia said before giving a polite smile."
        },
        {
            "name": "buzzed",
            "source": "Phone",
            "target": "Sam",
            "location": "unknown",
            "passage": "Her phone buzzed with a message from Sam which read exactly what she expected."
        },
        {
            "name": "ran",
            "source": "Sam",
            "target": "Sam",
            "location": "Sam's Bathroom",
            "passage": "Sam ran to the bathroom, cursing herself for never being able to wake up to her alarms."
        },
        {
            "name": "cursing",
            "source": "Sam",
            "target": "Sam",
            "location": "Sam's Bathroom",
            "passage": "Sam ran to the bathroom, cursing herself for never being able to wake up to her alarms."
        },
        {
            "name": "grabbed",
            "source": "Sam",
            "target": "Bag",
            "location": "Sam's Bedroom",
            "passage": "She grabbed her bag from her room then sprinted through the streets."
        },
        {
            "name": "sprinted through streets",
            "source": "Sam",
            "target": "Sam",
            "location": "Street",
            "passage": "She grabbed her bag from her room then sprinted through the streets."
        },
        {
            "name": "ask for coffee",
            "source": "Waitress",
            "target": "Julia",
            "location": "Café",
            "passage": "” The waiter asked, pointing to the cup."
        },
        {
            "name": "point to cup",
            "source": "Waitress",
            "target": "Julia",
            "location": "Café",
            "passage": "” The waiter asked, pointing to the cup."
        },
        {
            "name": "clear table",
            "source": "Waitress",
            "target": "Waitress",
            "location": "Café",
            "passage": "The table next to Julia had cleared once again."
        },
        {
            "name": "think",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "Julia thought for a second before nodding. “Sure."
        },
        {
            "name": "nod",
            "source": "Julia",
            "target": "Waitress",
            "location": "Café",
            "passage": "Julia thought for a second before nodding. “Sure."
        },
        {
            "name": "pulled out",
            "source": "Julia",
            "target": "Phone",
            "location": "Café",
            "passage": "”\nShe pulled out her phone, looking at Sam’s text from 30 minutes ago."
        },
        {
            "name": "looking at",
            "source": "Julia",
            "target": "Text",
            "location": "Café",
            "passage": "”\nShe pulled out her phone, looking at Sam’s text from 30 minutes ago."
        },
        {
            "name": "sighed",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "At 10:55, Julia sighed and took a sip of her second cup of lukewarm coffee."
        },
        {
            "name": "took a sip",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "At 10:55, Julia sighed and took a sip of her second cup of lukewarm coffee."
        },
        {
            "name": "picture running",
            "source": "Julia",
            "target": "Sam",
            "location": "Café",
            "passage": "She could picture Sam running out her door, hair all over, panicking while checking the time."
        },
        {
            "name": "picture panicking",
            "source": "Julia",
            "target": "Sam",
            "location": "Café",
            "passage": "She could picture Sam running out her door, hair all over, panicking while checking the time."
        },
        {
            "name": "picture checking",
            "source": "Julia",
            "target": "Sam",
            "location": "Café",
            "passage": "She could picture Sam running out her door, hair all over, panicking while checking the time."
        },
        {
            "name": "tried not to be annoyed",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "Julia tried not to be annoyed but this was not the first time. Or the second."
        },
        {
            "name": "leaned back",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "She leaned back in her chair, debating whether to order breakfast alone or wait a little longer."
        },
        {
            "name": "debating",
            "source": "Julia",
            "target": "Julia",
            "location": "Café",
            "passage": "She leaned back in her chair, debating whether to order breakfast alone or wait a little longer."
        },
        {
            "name": "sees Julia",
            "source": "Sam",
            "target": "Julia",
            "location": "Café",
            "passage": "Across the street, Sam sees Julia sitting at the front of the café."
        }
    ]
};