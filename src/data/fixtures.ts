import type { Category, VideoFixture } from "../types";

export const categories: Category[] = [
  { id: "science", name: "科學", icon: "🚀", sortOrder: 1, tone: "sky" },
  { id: "english", name: "英文", icon: "ABC", sortOrder: 2, tone: "apricot" },
  { id: "animals", name: "動物", icon: "🐾", sortOrder: 3, tone: "sage" },
];

const thumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const videos: VideoFixture[] = [
  { id: "why-sky-blue", categoryId: "science", categoryIds: ["science"], source: "youtube", youtubeVideoId: "bcVr13Fw7w8", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "Why Is the Sky Blue? | Physics for Kids", parentLabel: "天空為什麼是藍色？", thumbnailUrl: thumbnail("bcVr13Fw7w8"), sortOrder: 1 },
  { id: "big-story-dinosaurs", categoryId: "science", categoryIds: ["science"], source: "youtube", youtubeVideoId: "UOOkup9xigs", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "The Very Big Story of the Dinosaurs | SciShow Kids Compilation", parentLabel: "恐龍的故事", thumbnailUrl: thumbnail("UOOkup9xigs"), sortOrder: 2 },
  { id: "elmo-alphabet", categoryId: "english", categoryIds: ["english"], source: "youtube", youtubeVideoId: "Xn5PnwGUYhc", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "Sesame Street: Alphabet | Elmo's World", parentLabel: "Elmo 的字母世界", thumbnailUrl: thumbnail("Xn5PnwGUYhc"), sortOrder: 1 },
  { id: "usher-abc", categoryId: "english", categoryIds: ["english"], source: "youtube", youtubeVideoId: "SWvBAQf7v8g", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "Sesame Street: Usher's ABC Song", parentLabel: "跟著 Usher 唱 ABC", thumbnailUrl: thumbnail("SWvBAQf7v8g"), sortOrder: 2 },
  { id: "blue-whale", categoryId: "animals", categoryIds: ["animals"], source: "youtube", youtubeVideoId: "dciLg3Zm1hI", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "Blue Whale | Amazing Animals", parentLabel: "藍鯨有多大？", thumbnailUrl: thumbnail("dciLg3Zm1hI"), sortOrder: 1 },
  { id: "cheetah", categoryId: "animals", categoryIds: ["animals"], source: "youtube", youtubeVideoId: "J20eXhZTHEo", mediaType: null, mediaPath: null, mediaUrl: null, thumbnailPath: null, youtubeTitle: "Cheetah | Amazing Animals", parentLabel: "獵豹跑多快？", thumbnailUrl: thumbnail("J20eXhZTHEo"), sortOrder: 2 },
];
