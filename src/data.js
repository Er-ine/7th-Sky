const menuPhoto = (name, extension = 'jpg') => `/images/menu/${name}.${extension}`;
const restaurantPhoto = (name) => `/images/restaurant/${name}.jpg`;
const photoFallback = (name) => `/images/placeholders/${name}.jpg`;
export const uploadedMenuImageReplacements = new Map([
  ['chicken-biriyani', {
    previous: menuPhoto('chicken-biriyani'),
    current: menuPhoto('chicken biriyani.jpg', 'jpeg'),
  }],
  ['mutton-biriyani', {
    previous: menuPhoto('mutton-biriyani'),
    current: menuPhoto('mutton biriyani.jpg', 'jpeg'),
  }],
  ['peri-peri-chicken-mandi', {
    previous: menuPhoto('peri-peri-chicken-mandi'),
    current: menuPhoto('peri peri mandi.jpg', 'png'),
  }],
  ['beef-biriyani', {
    previous: menuPhoto('beef-biriyani'),
    current: menuPhoto('paneer biriyani.jpg', 'jpeg'),
  }],
  ['prawns-biriyani', {
    previous: menuPhoto('prawns-biriyani'),
    current: menuPhoto('fish biriyani.jpg', 'jpeg'),
  }],
  ['full-chicken-mandi', {
    previous: menuPhoto('full-chicken-mandi'),
    current: menuPhoto('honey chilli mandi.jpg', 'png'),
  }],
  ['chicken-mandi', {
    previous: menuPhoto('chicken-mandi'),
    current: menuPhoto('chicken mandi.jpg', 'png'),
  }],
  ['beef-mandi', {
    previous: menuPhoto('beef-mandi'),
    current: menuPhoto('beef mandi.jpg', 'png'),
  }],
]);

export const initialMenu = [
  {
    id: 'chicken-biriyani',
    name: 'Chicken Biriyani',
    description: 'Tender chicken and fragrant basmati rice, slow-cooked with warm spices.',
    category: 'Biriyani',
    price: 290,
    image: menuPhoto('chicken biriyani.jpg', 'jpeg'),
    available: true,
    tag: '',
  },
  {
    id: 'mutton-biriyani',
    name: 'Mutton Biriyani',
    description: 'Aromatic rice layered with tender mutton, caramelised onions, and spices.',
    category: 'Biriyani',
    price: 420,
    image: menuPhoto('mutton biriyani.jpg', 'jpeg'),
    available: true,
    tag: '',
  },
  {
    id: 'beef-biriyani',
    name: 'Paneer Biriyani',
    description: 'Fragrant basmati rice layered with paneer and gently toasted spices.',
    category: 'Biriyani',
    price: 360,
    image: menuPhoto('paneer biriyani.jpg', 'jpeg'),
    available: true,
    tag: '',
  },
  {
    id: 'prawns-biriyani',
    name: 'Fish Biriyani',
    description: 'Delicate fish served with fragrant rice and a bright blend of spices.',
    category: 'Biriyani',
    price: 390,
    image: menuPhoto('fish biriyani.jpg', 'jpeg'),
    available: true,
    tag: '',
  },
  {
    id: 'chicken-mandi',
    name: 'Chicken Mandi',
    description: 'Juicy spiced chicken served over delicate, fragrant mandi rice.',
    category: 'Mandi',
    price: 360,
    image: menuPhoto('chicken mandi.jpg', 'png'),
    available: true,
    tag: '',
  },
  {
    id: 'beef-mandi',
    name: 'Beef Mandi',
    description: 'Savoury beef with aromatic rice and a mellow blend of warming spices.',
    category: 'Mandi',
    price: 450,
    image: menuPhoto('beef mandi.jpg', 'png'),
    available: true,
    tag: '',
  },
  {
    id: 'peri-peri-chicken-mandi',
    name: 'Peri Peri Chicken Mandi',
    description: 'Grilled chicken with a lively peri peri kick, served with mandi rice.',
    category: 'Mandi',
    price: 430,
    image: menuPhoto('peri peri mandi.jpg', 'png'),
    available: true,
    tag: '',
  },
  {
    id: 'full-chicken-mandi',
    name: 'Honey Chilli Mandi',
    description: 'A sweet, gently spiced honey chilli favourite served over mandi rice.',
    category: 'Mandi',
    price: 1_050,
    image: menuPhoto('honey chilli mandi.jpg', 'png'),
    available: true,
    tag: '',
  },
];

export const initialCategories = ['Biriyani', 'Mandi'];

export const heroSlides = [
  {
    image: `${restaurantPhoto('hero-01')}.png`,
    alt: 'The 7th Sky restaurant entrance illuminated at night',
    label: 'A little room for pleasure.',
    caption: 'An easy place to settle in and eat well.',
  },
  {
    image: `${restaurantPhoto('hero-02')}.png`,
    alt: 'A lit garden walkway leading to the restaurant',
    label: 'Stay for one more bite.',
    caption: 'A menu made for the moment you are in.',
  },
  {
    image: `${restaurantPhoto('hero-03')}.png`,
    alt: 'A warmly lit outdoor dining area at 7th Sky',
    label: 'Good things, gathered.',
    caption: 'Bring your appetite. We will take it from here.',
  },
  {
    image: `${restaurantPhoto('hero-04')}.png`,
    alt: 'A leafy garden dining nook at 7th Sky',
    label: 'Find your favourite corner.',
    caption: 'Settle in, take your time, and stay awhile.',
  },
];

export const brandLogo = '/images/restaurant/wordmark.png';
export const storyImage = restaurantPhoto('story');
export const storyImageFallback = photoFallback('story');

export const formatRupees = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

export const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
};

export const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Could not save ${key} to local storage.`, error);
  }
};
