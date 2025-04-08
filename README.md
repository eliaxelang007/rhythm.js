# Rhythm.js!

## Description
[rhythm.js](https://github.com/eliaxelang007/rhythm.js/tree/main) is a relatively thin wrapper around the Web AudioAPI that (hopefully) makes interacting with it a lot more intuitive!

The whole library is built around the concepts of **Audio Commands** and **Audio Tracks**. <br/>
You can **nest audio commands inside other audio commands** to get more complex behavior!

It's like Google's **Flutter** but for audio manipulation.

## Documentation

### Commands

Here's a list of the currently available audio commands.

| AudioCommand | Description |
| --- | --- |
| `Play(path: string)` | The most basic audio command. Plays the audio file specified in `path`! |
| `Clip(to_clip: AudioCommand, duration: Seconds, offset: Seconds = 0)` | Creates a clip of its child command starting at `offset` and playing from there for `duration`. |
| `Repeat(to_repeat: AudioCommand, duration: Seconds)` | Repeats its child command until it fits into `duration`. |
| `Sequence(sequence: AudioCommand[])` | Plays each command in `sequence` one after the other. |
| `Gain(to_gain: AudioCommand, gain_commands: GainCommand[]) ` | Plays its child command normally but `gain_commands` lets you control how the volume will change over time! |

### General Usage

First make a command,

```javascript
const some_command = new Repeat(new Clip(new Play("example.mp3"), 10, 5), 20);
```

compile it into a track,

```javascript
const rhythm = new RhythmContext(/* new AudioContext() [You can optionally provide an AudioContext] */);
const track = await rhythm.compile(some_command);
```

and finally play it!

```javascript
track.schedule_play();
```

You can schedule the track at a different time by supplying it as the first parameter, <br/>
and you can specify where the audio playback should begin in the second parameter.

(Works just like [`AudioBufferSourceNode.start`](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start) but without the third `duration` parameter!)

```javascript
// Starts the track 1 second from now with playback beginning at 3 seconds into the track.
track.schedule_play(rhythm.current_time + 1, 3); 
```

Note: `rhythm.current_time` is an alias for the `currentTime` of the `RhythmContext`'s inner `AudioContext`.

## Examples

### Play

To play a track with rhythm.js, try this!

```javascript
import { RhythmContext, Play } from "../dist/rhythm.esm.js";

async function play() {
  const command = new Play("./celery_in_a_carrot_field.ogg");

  const rhythm = new RhythmContext();
  const track = await rhythm.compile(command);

  track.schedule_play();
}

play();
```

### Clip

To create a clip of a certain section of a track, do this!

In this code snippet, `Clip` will create a track that starts 5 seconds 
into its child node, `Play`, and then plays its next 10 seconds.

```javascript
import { RhythmContext, Play, Clip } from "../dist/rhythm.esm.js";

async function play() {
  const clip_duration_seconds = 10;
  const start_at_seconds = 5;

  const command = new Clip(
    new Play("./celery_in_a_carrot_field.ogg"),
    clip_duration_seconds,
    start_at_seconds
  );

  const rhythm = new RhythmContext();
  const track = await rhythm.compile(command);

  track.schedule_play();
}

play();
```

### Repeat

To repeat a track, do this!
In this code snippet, the `Repeat` node will keep repeating the`Clip` node inside it while it hasn't been 20 seconds yet.

```javascript
import { RhythmContext, Play, Clip } from "../dist/rhythm.esm.js";

async function play() {
  const clip_duration_seconds = 10;
  const start_at_seconds = 5;

  const repeat_duration_seconds = 20;

  const command = new Repeat(
    new Clip(
      new Play("./celery_in_a_carrot_field.ogg"),
      clip_duration_seconds,
      start_at_seconds
    ),
    repeat_duration_seconds
  );

  const rhythm = new RhythmContext();
  const track = await rhythm.compile(command);

  track.schedule_play();
}

play();
```

# Credits
Sample music in tests from [StarryAttic](https://www.youtube.com/watch?v=FqI9cM6fczU) on Youtube!