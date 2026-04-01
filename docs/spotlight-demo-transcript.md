---
title: spotlight-demo.mp4
source: "https://conductor-changelog.t3.storage.dev/uploads/1766780120151-spotlight-demo.mp4"
type: video
diarized: true
speakers:
  - A
transcriptionModel: gpt-4o-transcribe-diarize
date: "2026-03-31T22:22:44.946Z"
---

**A** [0:00]
Hello,
so this is spotlight testing,
an experimental new way of testing your changes in conductor.
And instead of explaining it, I'm just going to show you how it works and talk you through it as we do it live.
So to turn on spotlight,
first you should go to settings and then experimental and toggle on spotlight testing. And then when you're in a workspace,
you'll see this big start spotlight button.
And so click that.
And so now we are in a terminal in our repo root directory.
And every time we now make a change in this workspace,
it will be swapped into that repo root directory.
So it's sort of like hot reloading your changes into the repo root.
So if I run pnpm run dev.
Now our server is running in the repo root and all the changes that I have on this in this workspace.
So I said add introducing spotlight testing should now be live.
So if I click on the little preview,
this is our landing page and you can see introducing spotlight testing text is showing up. But if I switch to a different workspace.
In this one, I made the background of the homepage blue.
I can start spotlight with command R and you're going to see it loads all the changes in this workspace into our repo root.
And I can switch back and forth and you'll see it's really fast.
So there it is. It's just already compiled.
So spotlight is a great.
a great tool if you have a code base that takes a really long time to spin up but then can quickly hot reload or if you have a lot of hard-coded values in your dev script like ports or like DB URLs spotlight could also be a good fit for you so I'd love to hear your feedback play around with it let me know how it goes
