// Sample menu data for Phase 1 (no backend yet).
// It has the SAME shape as the future API response for `GET ?action=menu`:
//   { settings, categories, items }
// so in Phase 3 we can swap this file for a real fetch without changing menu.js.
// All prices, descriptions and contact details are PLACEHOLDERS.

export const SAMPLE_MENU = {
  settings: {
    restaurant_name: 'Hot Wok Restaurant',
    tagline: 'Authentic Chinese & Sri Lankan favourites',
    phone: '+94 XX XXX XXXX',
    address: '(Address to be provided)',
    opening_hours: '(Opening hours to be provided)',
    map_url: 'https://maps.google.com/?q=Hot+Wok+Restaurant',
    notice: 'Sample menu – prices are placeholders',
    show_sold_out: false
  },

  categories: [
    { name: 'Fried Rice', sort_order: 1, visible: true },
    { name: 'Kottu', sort_order: 2, visible: true },
    { name: 'Noodles', sort_order: 3, visible: true },
    { name: 'Devilled Dishes', sort_order: 4, visible: true },
    { name: 'Soups', sort_order: 5, visible: true },
    { name: 'Side Dishes', sort_order: 6, visible: true },
    { name: 'Beverages', sort_order: 7, visible: true },
    { name: 'Desserts', sort_order: 8, visible: true }
  ],

  items: [
    { id: 'itm_fr0001', category: 'Fried Rice', name: 'Egg Fried Rice', description: 'Wok-tossed rice with egg and spring onion.', price: 950, price_large: 1300, spicy: false, veg: false, available: true, featured: false, image: '', sort_order: 1 },
    { id: 'itm_fr0002', category: 'Fried Rice', name: 'Chicken Fried Rice', description: 'Classic fried rice with tender chicken pieces.', price: 1100, price_large: 1500, spicy: false, veg: false, available: true, featured: true, image: '', sort_order: 2 },
    { id: 'itm_fr0003', category: 'Fried Rice', name: 'Mixed Fried Rice', description: 'Chicken, prawns, egg and vegetables.', price: 1400, price_large: 1900, spicy: false, veg: false, available: true, featured: false, image: '', sort_order: 3 },
    { id: 'itm_fr0004', category: 'Fried Rice', name: 'Vegetable Fried Rice', description: 'Fresh seasonal vegetables, no meat or egg.', price: 850, price_large: 1150, spicy: false, veg: true, available: true, featured: false, image: '', sort_order: 4 },
    { id: 'itm_fr0005', category: 'Fried Rice', name: 'Seafood Fried Rice', description: 'Prawns, cuttlefish and fish.', price: 1500, price_large: 2000, spicy: false, veg: false, available: false, featured: false, image: '', sort_order: 5 },

    { id: 'itm_ko0001', category: 'Kottu', name: 'Chicken Kottu', description: 'Chopped roti with chicken, egg and vegetables.', price: 1200, price_large: 1600, spicy: true, veg: false, available: true, featured: true, image: '', sort_order: 1 },
    { id: 'itm_ko0002', category: 'Kottu', name: 'Cheese Kottu', description: 'Chicken kottu finished with melted cheese.', price: 1500, price_large: 1950, spicy: true, veg: false, available: true, featured: false, image: '', sort_order: 2 },
    { id: 'itm_ko0003', category: 'Kottu', name: 'Egg Kottu', description: '', price: 950, price_large: 1300, spicy: true, veg: false, available: true, featured: false, image: '', sort_order: 3 },
    { id: 'itm_ko0004', category: 'Kottu', name: 'Vegetable Kottu', description: 'Chopped roti with mixed vegetables.', price: 850, price_large: 1150, spicy: true, veg: true, available: true, featured: false, image: '', sort_order: 4 },
    { id: 'itm_ko0005', category: 'Kottu', name: 'Dolphin Kottu', description: 'Large strips of roti with a rich chicken curry.', price: 1600, price_large: 2100, spicy: true, veg: false, available: true, featured: false, image: '', sort_order: 5 },

    { id: 'itm_no0001', category: 'Noodles', name: 'Chicken Noodles', description: 'Stir-fried egg noodles with chicken.', price: 1100, price_large: 1500, spicy: false, veg: false, available: true, featured: false, image: '', sort_order: 1 },
    { id: 'itm_no0002', category: 'Noodles', name: 'Mixed Noodles', description: 'Chicken, prawns, egg and vegetables.', price: 1400, price_large: 1900, spicy: false, veg: false, available: true, featured: false, image: '', sort_order: 2 },

    { id: 'itm_de0001', category: 'Devilled Dishes', name: 'Devilled Chicken', description: 'Crispy chicken tossed with onion, capsicum and chilli.', price: 1300, price_large: null, spicy: true, veg: false, available: true, featured: false, image: '', sort_order: 1 },
    { id: 'itm_de0002', category: 'Devilled Dishes', name: 'Hot Butter Cuttlefish', description: 'Batter-fried cuttlefish with garlic and chilli.', price: 1600, price_large: null, spicy: true, veg: false, available: true, featured: true, image: '', sort_order: 2 },

    { id: 'itm_so0001', category: 'Soups', name: 'Chicken Sweet Corn Soup', description: 'Thick, mild soup with chicken and corn.', price: 650, price_large: null, spicy: false, veg: false, available: true, featured: false, image: '', sort_order: 1 },

    { id: 'itm_si0001', category: 'Side Dishes', name: 'Chopsuey', description: 'Mixed vegetables in a light gravy.', price: 900, price_large: null, spicy: false, veg: true, available: true, featured: false, image: '', sort_order: 1 },

    { id: 'itm_be0001', category: 'Beverages', name: 'Fresh Lime Juice', description: '', price: 350, price_large: null, spicy: false, veg: true, available: true, featured: false, image: '', sort_order: 1 },
    { id: 'itm_be0002', category: 'Beverages', name: 'Soft Drink', description: 'Ask staff for available flavours.', price: 250, price_large: null, spicy: false, veg: true, available: true, featured: false, image: '', sort_order: 2 }
  ]
};
