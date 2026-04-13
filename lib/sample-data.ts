import type { OstSongItem } from '@/lib/schema';

export const sampleSongs: OstSongItem[] = [
  {
    id: 'oshi-no-ko-way-of-leaving',
    song_title: 'Way of leaving (feat.o.j.o)',
    subtitle: 'TVアニメ「【推しの子】」 オリジナルサウンドトラックVol.3',
    tags: ['推しの子', 'OST', 'Emotional', 'Piano'],
    composer: '伊賀拓郎',
    bangumi_id: 403640,
    media_urls: {
      ytb_url: 'https://www.youtube.com/watch?v=A4DaX1w7zPs',
      bili_url: 'https://www.bilibili.com/video/BV1L3ADzfERa'
    },
    img_urls: [
      'https://files.seeusercontent.com/2026/03/04/Of3m/a0fc402.jpg',
      'https://lsky.ry.mk/i/2026/02/26/c26cfcfa76502.webp',
      'https://pub-141831e61e69445289222976a15b6fb3.r2.dev/Image_to_url_V2/-----imagetourl.cloud-1772422628953-yldnge.png'
    ],
    extras: {
      source_type: 'seed'
    }
  },
  {
    id: 'bocchi-distortion',
    song_title: 'Distortion!!',
    subtitle: 'TVアニメ「ぼっち・ざ・ろっく！」挿入歌',
    tags: ['ぼっち・ざ・ろっく！', 'Rock', 'Insert Song'],
    composer: '音羽-otoha-',
    media_urls: {
      ytb_url: 'https://www.youtube.com/watch?v=5tc14WHUoMw'
    },
    img_urls: [
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1920&auto=format&fit=crop'
    ]
  }
];
