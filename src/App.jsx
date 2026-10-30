import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { brandLogo, formatRupees, heroSlides, initialCategories, initialMenu, readStorage, uploadedMenuImageReplacements, writeStorage } from './data.js';

const orderStatuses = ['New', 'Accepted', 'Preparing', 'Ready', 'Completed'];
const demoUsers = {
  kitchen: { password: 'kitchen123', role: 'kitchen' },
  owner: { password: 'owner123', role: 'owner' },
};
const retiredMenuIds = new Set([
  'alfaham-mandi',
  'alfaham-chicken-mandi',
  'kanthari-mandi',
  'honey-chilli-chicken-mandi',
  'mutton-mandi',
  'half-chicken-mandi',
]);
const renamedMenuItems = new Map([
  ['beef-biriyani', { previousName: 'Beef Biriyani', previousDescription: 'A hearty spiced rice classic with slow-cooked beef and fresh herbs.' }],
  ['prawns-biriyani', { previousName: 'Prawns Biriyani', previousDescription: 'Juicy prawns folded through fragrant spiced rice with a bright herb finish.' }],
  ['full-chicken-mandi', { previousName: 'Full Chicken Mandi', previousDescription: 'A generous whole-chicken mandi served with a fragrant bed of rice.' }],
]);
const maxTables = 50;

function validTable(value, count) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= count ? String(parsed) : '';
}

function orderTypeLabel(type) {
  if (type === 'dine-in') return 'Dine-in';
  if (type === 'delivery') return 'Delivery';
  return 'Takeaway';
}

function paymentMethodLabel(method) {
  if (method === 'upi') return 'UPI';
  return 'Card';
}

function validDemoCardNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function migrateMenu(savedMenu, preserveDeletions = false) {
  if (!Array.isArray(savedMenu)) return initialMenu;
  const seedIds = new Set(initialMenu.map((dish) => dish.id));
  const savedById = new Map(savedMenu.filter((dish) => dish && typeof dish.id === 'string').map((dish) => [dish.id, dish]));
  const seededMenu = initialMenu.flatMap((dish) => {
    const savedDish = savedById.get(dish.id);
    if (!savedDish) return preserveDeletions ? [] : [dish];
    const uploadedImage = uploadedMenuImageReplacements.get(dish.id);
    const renamedItem = renamedMenuItems.get(dish.id);
    return [{
      ...dish,
      ...savedDish,
      id: dish.id,
      name: renamedItem?.previousName === savedDish.name ? dish.name : savedDish.name ?? dish.name,
      description: renamedItem?.previousDescription === savedDish.description ? dish.description : savedDish.description ?? dish.description,
      category: initialCategories.includes(savedDish.category) ? savedDish.category : dish.category,
      image: savedDish.image === uploadedImage?.previous ? uploadedImage.current : savedDish.image ?? dish.image,
    }];
  });
  const customMenu = savedMenu.filter((dish) =>
    dish
    && typeof dish.id === 'string'
    && !seedIds.has(dish.id)
    && !retiredMenuIds.has(dish.id)
    && initialCategories.includes(dish.category),
  );
  return [...seededMenu, ...customMenu];
}

function migrateOrders(savedOrders) {
  if (!Array.isArray(savedOrders)) return [];
  return savedOrders.flatMap((order) => {
    if (!order || !Array.isArray(order.items) || !order.paymentStatus?.includes('simulated success')) return [];
    const items = order.items
      .filter((item) => item && !retiredMenuIds.has(item.id))
      .map((item) => {
        const renamedItem = renamedMenuItems.get(item.id);
        const currentDish = initialMenu.find((dish) => dish.id === item.id);
        return {
          ...item,
          name: renamedItem?.previousName === item.name ? currentDish.name : item.name,
          image: uploadedMenuImageReplacements.get(item.id)?.previous === item.image
            ? uploadedMenuImageReplacements.get(item.id).current
            : item.image,
        };
      });
    if (!items.length) return [];
    return [{
      ...order,
      items,
      subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
      table: order.orderType === 'dine-in' ? order.table : '',
    }];
  });
}

function loadMenu() {
  const schemaVersion = readStorage('7sky-menu-schema', 0);
  return migrateMenu(readStorage('7sky-menu', initialMenu), schemaVersion >= 2);
}

function loadCart() {
  const savedCart = readStorage('7sky-cart', {});
  if (!savedCart || typeof savedCart !== 'object') return {};
  const menuById = new Map(loadMenu().map((dish) => [dish.id, dish]));
  return Object.fromEntries(Object.entries(savedCart).flatMap(([id, item]) => {
    const dish = menuById.get(id);
    if (!dish || !Number.isInteger(item?.quantity) || item.quantity <= 0) return [];
    return [[id, { ...dish, quantity: item.quantity }]];
  }));
}

function FoodImage({ src, fallbackSrc, alt, className = '', allowFallback = true }) {
  const [imageSrc, setImageSrc] = useState(src);
  useEffect(() => setImageSrc(src), [src]);
  const localFallback = fallbackSrc || (allowFallback && src?.startsWith('/images/restaurant/')
    ? src.replace('/images/restaurant/', '/images/placeholders/')
    : '');
  return !imageSrc ? (
    <div className={`image-fallback ${className}`} role="img" aria-label={alt}>
      <span>PHOTO UNAVAILABLE</span>
    </div>
  ) : (
    <img
      className={className}
      src={imageSrc}
      alt={alt}
      loading={className.includes('hero-image') ? 'eager' : 'lazy'}
      fetchPriority={className.includes('hero-image') ? 'high' : 'auto'}
      onError={() => setImageSrc((current) => current === localFallback ? '' : localFallback)}
    />
  );
}

function QrCodeImage({ value, label }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'Q', margin: 2, width: 220 })
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch((cause) => {
        console.error('Could not generate the table QR code.', cause);
        if (active) setError('QR code could not be generated. Try again or check the browser console.');
      });
    return () => { active = false; };
  }, [value]);
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!image) return <p className="muted-copy">Creating QR code…</p>;
  return <a className="qr-download" href={image} download={`${label.toLowerCase().replaceAll(' ', '-')}.png`} aria-label={`Download ${label} QR code`}>
    <img src={image} alt={`${label} QR code for the 7th Sky ordering page`} />
    <span>Download QR</span>
  </a>;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(loadMenu);
  const [cart, setCart] = useState(loadCart);
  const [tableCount, setTableCount] = useState(() => {
    const savedCount = readStorage('7sky-table-count', 12);
    return Number.isInteger(savedCount) && savedCount > 0 && savedCount <= maxTables ? savedCount : 12;
  });
  const [table, setTable] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('table')
      ? validTable(params.get('table'), readStorage('7sky-table-count', 12))
      : validTable(readStorage('7sky-table', ''), maxTables);
  });
  const [tableNotice, setTableNotice] = useState('');
  const [orderType, setOrderType] = useState(() => {
    if (table) return 'dine-in';
    const savedOrderType = readStorage('7sky-order-type', '');
    return savedOrderType === 'takeaway' || savedOrderType === 'delivery' ? savedOrderType : '';
  });
  const [orders, setOrders] = useState(() => migrateOrders(readStorage('7sky-orders', [])));
  const menuCategories = initialCategories;
  const [user, setUser] = useState(() => readStorage('7sky-user', null));
  const [toast, setToast] = useState('');
  const toastTimeout = useRef(0);

  useEffect(() => writeStorage('7sky-cart', cart), [cart]);
  useEffect(() => writeStorage('7sky-order-type', orderType), [orderType]);
  useEffect(() => writeStorage('7sky-table', table), [table]);
  useEffect(() => writeStorage('7sky-table-count', tableCount), [tableCount]);
  useEffect(() => writeStorage('7sky-orders', orders), [orders]);
  useEffect(() => {
    writeStorage('7sky-menu', menu);
    writeStorage('7sky-menu-schema', 4);
  }, [menu]);
  useEffect(() => writeStorage('7sky-user', user), [user]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('table')) return;
    const detectedTable = validTable(params.get('table'), tableCount);
    if (!detectedTable) {
      setTable('');
      setOrderType('');
      setTableNotice(`That table QR is not configured. Choose a table from 1 to ${tableCount}.`);
      return;
    }
    setTable(detectedTable);
    setOrderType('dine-in');
    setTableNotice('');
  }, [location.search, tableCount]);
  useEffect(() => {
    if (table && !validTable(table, tableCount)) {
      setTable('');
      setOrderType((current) => current === 'dine-in' ? '' : current);
      setTableNotice(`That table is no longer configured. Choose a table from 1 to ${tableCount}.`);
    }
  }, [table, tableCount]);
  useEffect(() => {
    const sync = (event) => {
      try {
        if (event.key === '7sky-orders' && event.newValue) setOrders(migrateOrders(JSON.parse(event.newValue)));
        if (event.key === '7sky-menu' && event.newValue) setMenu(migrateMenu(JSON.parse(event.newValue), true));
      } catch (error) {
        console.error('Could not sync restaurant demo data from another tab.', error);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const frame = window.requestAnimationFrame(() => {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return undefined;
  }, [location.pathname, location.hash]);
  useEffect(() => () => window.clearTimeout(toastTimeout.current), []);

  const quantities = Object.values(cart);
  const itemCount = quantities.reduce((total, item) => total + item.quantity, 0);
  const subtotal = quantities.reduce((total, item) => total + item.quantity * item.price, 0);

  const setQuantity = (dish, quantity) => {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[dish.id];
      else next[dish.id] = { id: dish.id, name: dish.name, price: dish.price, image: dish.image, quantity };
      return next;
    });
  };

  const chooseOrderType = (type) => {
    if (type !== 'dine-in') setTable('');
    setTableNotice('');
    setOrderType(type);
    navigate('/menu');
  };

  const showToast = (message) => {
    window.clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = window.setTimeout(() => setToast(''), 2400);
  };
  const addToCart = (dish) => {
    setQuantity(dish, 1);
    showToast('Added to your order!');
  };
  const logout = () => setUser(null);
  const isHome = location.pathname === '/';
  const isDashboard = location.pathname === '/kitchen' || location.pathname === '/owner';
  const isOperations = isDashboard || location.pathname === '/login/kitchen' || location.pathname === '/login/owner';
  const siteHeader = isHome
    ? <HomeHeader itemCount={itemCount} user={user} onLogout={logout} table={table} />
    : isOperations
      ? <DashboardHeader user={user} onLogout={logout} />
      : <InnerPageHeader itemCount={itemCount} user={user} onLogout={logout} table={table} />;
  const siteFooter = isHome ? <HomeFooter /> : isOperations ? null : <InnerPageFooter />;

  return (
    <>
      {siteHeader}
      <Routes>
        <Route path="/" element={<Home menu={menu} onChoose={chooseOrderType} tableNotice={tableNotice} />} />
        <Route
          path="/menu"
          element={
            <MenuPage
              menu={menu}
              categories={menuCategories}
              cart={cart}
              orderType={orderType}
              setQuantity={setQuantity}
              onAdd={addToCart}
              table={table}
              tableNotice={tableNotice}
              toast={toast}
            />
          }
        />
        <Route
          path="/cart"
          element={
            <CartPage
              cart={cart}
              itemCount={itemCount}
              subtotal={subtotal}
              orderType={orderType}
              table={table}
              tableNotice={tableNotice}
              setQuantity={setQuantity}
              onMissingTable={setTableNotice}
            />
          }
        />
        <Route
          path="/payment"
          element={
            <CheckoutPage
              cart={cart}
              subtotal={subtotal}
              orderType={orderType}
              orders={orders}
              setOrders={setOrders}
              setCart={setCart}
              table={table}
            />
          }
        />
        <Route path="/confirmation/:orderId" element={<ConfirmationPage orders={orders} />} />
        <Route
          path="/login/:role"
          element={<LoginPage setUser={setUser} />}
        />
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute user={user} role="kitchen">
              <KitchenPage orders={orders} setOrders={setOrders} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner"
          element={
            <ProtectedRoute user={user} role="owner">
              <OwnerPage orders={orders} menu={menu} setMenu={setMenu} categories={menuCategories} tableCount={tableCount} setTableCount={setTableCount} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {siteFooter}
    </>
  );
}

function HomeHeader(props) {
  return <Header {...props} variant="home" />;
}

function InnerPageHeader(props) {
  return <Header {...props} variant="inner" />;
}

function DashboardHeader(props) {
  const { user, onLogout } = props;
  const location = useLocation();
  const role = user?.role || (location.pathname.endsWith('/owner') ? 'owner' : 'kitchen');
  const dashboardPath = role === 'owner' ? '/owner' : '/kitchen';
  return (
    <header className={`operations-header operations-header-${role}`}>
      <div className="operations-header-inner">
        <Link className="operations-brand" to={dashboardPath} aria-label={`7th Sky ${role} dashboard`}>
          <img className="brand-logo" src={brandLogo} alt="7th Sky" />
          <span>{role === 'owner' ? 'OWNER DESK' : 'KITCHEN PASS'}</span>
        </Link>
        <div className="operations-heading">
          <span className="operations-indicator" />
          <span>{role === 'owner' ? 'Owner dashboard' : 'Kitchen dashboard'}</span>
          <small>LOCAL DEMO</small>
        </div>
        {user ? <button className="operations-logout" onClick={onLogout}>Log out <span aria-hidden="true">↗</span></button> : <span className="operations-access">Team access</span>}
      </div>
    </header>
  );
}

function Header({ itemCount, user, onLogout, table, variant }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setLoginOpen(false);
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className={`site-header site-header-${variant}`}>
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="7th Sky home">
          <img className="brand-logo" src={brandLogo} alt="7th Sky" />
        </Link>
        {table && <span className="table-indicator">Dining at Table {table}</span>}
        <button className="mobile-menu-toggle" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label="Toggle navigation">
          <span /><span />
        </button>
        <nav className={`main-nav ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/menu">Menu</Link>
          {variant === 'home' && <><Link to="/#story">Our story</Link><Link to="/#order">Order</Link></>}
          <Link className="nav-cart" to="/cart">Cart <span>{itemCount}</span></Link>
        </nav>
        <div className="login-wrap">
          {user ? (
            <div className="signed-in">
              <Link to={user.role === 'owner' ? '/owner' : '/kitchen'}>{user.role === 'owner' ? 'Owner desk' : 'Kitchen'}</Link>
              <button className="login-button" onClick={onLogout}>Log out</button>
            </div>
          ) : (
            <>
              <button className="login-button" onClick={() => setLoginOpen((open) => !open)} aria-expanded={loginOpen}>Login <span aria-hidden="true">⌄</span></button>
              {loginOpen && (
                <div className="login-menu">
                  <span className="eyebrow">DEMO TEAM ACCESS</span>
                  <Link to="/login/kitchen">Kitchen login <span>↗</span></Link>
                  <Link to="/login/owner">Owner login <span>↗</span></Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Home({ menu, onChoose, tableNotice }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const interval = window.setInterval(() => setActive((current) => (current + 1) % heroSlides.length), 7000);
    return () => window.clearInterval(interval);
  }, []);
  const slide = heroSlides[active];
  const featuredDishes = menu.filter((dish) => dish.available).slice(0, 3);
  const storyDish = menu.find((dish) => dish.id === 'beef-mandi') || menu[0];
  const deliveryDish = menu.find((dish) => dish.id === 'chicken-biriyani') || menu[0];
  return (
    <main>
      <section className="hero">
        <FoodImage key={slide.image} src={slide.image} alt={slide.alt} className={`hero-image hero-image-${active}`} allowFallback={false} />
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="hero-brand-name">7th Sky</span>
          <span className="eyebrow light">A TABLE TO REMEMBER <i /> FOOD, FOR THE PLEASURE OF IT</span>
          <h1 key={slide.label}>{slide.label}</h1>
          <p>{slide.caption}</p>
          <Link to="/menu" className="button button-light">Discover the menu <span>↗</span></Link>
        </div>
        <div className="hero-bottom">
          <span className="photo-disclosure">A GLIMPSE OF GOOD THINGS</span>
          <div className="slide-controls" aria-label="Slideshow controls">
            <button onClick={() => setActive((active + heroSlides.length - 1) % heroSlides.length)} aria-label="Previous slide">←</button>
            <div className="slide-dots">
              {heroSlides.map((item, index) => <button key={item.image} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show slide ${index + 1}`} aria-current={index === active ? 'true' : undefined} />)}
            </div>
            <button onClick={() => setActive((active + 1) % heroSlides.length)} aria-label="Next slide">→</button>
          </div>
        </div>
      </section>

      {tableNotice && <div className="section-wrap"><p className="table-notice" role="status">{tableNotice}</p></div>}

      <section className="story-section section-wrap" id="story">
        <div className="story-copy">
          <span className="eyebrow">A PLACE AT THE TABLE</span>
          <h2>Make an evening<br />of <em>something good.</em></h2>
          <p>At 7th Sky, biriyani, mandi and good company turn any meal into a moment worth savouring.</p>
          <Link to="/menu" className="text-link">Take a look at the menu <span>↗</span></Link>
        </div>
        <div className="story-visual">
          <FoodImage src={storyDish?.image} alt="Beef Mandi from the 7th Sky menu" className="story-photo" />
          <span className="photo-caption">BEEF MANDI · FROM OUR MENU</span>
        </div>
      </section>

      <section className="signature-section" id="signature">
        <div className="section-wrap">
          <div className="signature-heading">
            <div><span className="eyebrow">A FIRST LOOK</span><h2>Start with<br /><em>something lovely.</em></h2></div>
            <Link to="/menu" className="text-link">The full sample menu <span>↗</span></Link>
          </div>
          <div className="signature-grid">
            {featuredDishes[0] && <article className="signature-feature">
              <FoodImage src={featuredDishes[0].image} fallbackSrc={featuredDishes[0].imageFallback} alt={`${featuredDishes[0].name}; sample dish photography`} className="signature-image" />
              <div className="signature-overlay"><span className="eyebrow light">{featuredDishes[0].category} · SAMPLE DISH</span><h3>{featuredDishes[0].name}</h3><span>{formatRupees(featuredDishes[0].price)}</span></div>
              <span className="photo-caption">SAMPLE PHOTOGRAPHY</span>
            </article>}
            <div className="signature-side">
              {featuredDishes.slice(1).map((dish) => <article className="signature-small" key={dish.id}>
                <FoodImage src={dish.image} fallbackSrc={dish.imageFallback} alt={`${dish.name}; sample dish photography`} className="signature-small-image" />
                <div><span className="eyebrow">{dish.category} · SAMPLE DISH</span><h3>{dish.name}</h3><span>{formatRupees(dish.price)}</span></div>
              </article>)}
            </div>
          </div>
          <p className="sample-note signature-note">Dish names, descriptions, prices and photographs are examples until the restaurant’s menu is supplied.</p>
        </div>
      </section>

      <section className="order-section" id="order">
        <div className="section-wrap order-wrap">
          <div className="order-intro">
            <span className="eyebrow">MADE FOR YOUR KIND OF EVENING</span>
            <h2>Here or<br /><em>on the way.</em></h2>
            <p>Choose how you would like to order. You can change your mind later.</p>
          </div>
          <div className="order-options">
            <button className="order-card takeaway-card" onClick={() => onChoose('takeaway')}>
              <FoodImage src={heroSlides[1].image} alt="" className="order-card-image" allowFallback={false} />
              <span className="order-number">01 · TAKE IT WITH YOU</span>
              <strong>Takeaway</strong>
              <span>Order ahead. Take the good part home.</span>
              <i aria-hidden="true">↗</i>
            </button>
            <button className="order-card dinein-card" onClick={() => onChoose('dine-in')}>
              <FoodImage src={heroSlides[2].image} alt="" className="order-card-image" allowFallback={false} />
              <span className="order-number">02 · TAKE YOUR TIME</span>
              <strong>Dine in</strong>
              <span>Settle in. We’ll bring it to the table.</span>
              <i aria-hidden="true">↗</i>
            </button>
            <button className="order-card delivery-card" onClick={() => onChoose('delivery')}>
              <FoodImage src={deliveryDish?.image} alt="" className="order-card-image" />
              <span className="order-number">03 · AT YOUR DOOR</span>
              <strong>Delivery</strong>
              <span>Bring a little 7th Sky to your table at home.</span>
              <i aria-hidden="true">↗</i>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function MenuPage({ menu, categories, cart, orderType, setQuantity, onAdd, table, tableNotice, toast }) {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const filtered = menu.filter((dish) => {
    const matchesCategory = category === 'All' || dish.category === category;
    const query = search.trim().toLowerCase();
    return matchesCategory && (!query || `${dish.name} ${dish.description} ${dish.category}`.toLowerCase().includes(query));
  });
  const itemCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = Object.values(cart).reduce((sum, item) => sum + item.quantity * item.price, 0);
  return (
    <main className="page-shell menu-page">
      <div className="menu-intro">
        <span className="eyebrow">A TASTE OF 7TH SKY</span>
        <h1>Made for<br /><em>moments worth savouring.</em></h1>
        <p>Settle in with fragrant biriyani, slow-cooked mandi and a little something to remember.</p>
        <span className="sample-pill">ILLUSTRATIVE MENU · PRICES IN ₹</span>
      </div>
      <div className="menu-toolbar">
        <div className="category-list" role="group" aria-label="Filter menu category">
          {['All', ...categories].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find something lovely" aria-label="Search menu" /></label>
      </div>
      {orderType && <div className="order-type-note"><span>YOUR ORDER</span> {orderType === 'dine-in' ? (table ? `Dining at Table ${table}` : 'Dine in · scan your table QR') : orderType === 'delivery' ? 'Delivery' : 'Takeaway'} <Link to="/">Change</Link></div>}
      {tableNotice && !table && <p className="table-notice" role="status">{tableNotice}</p>}
      {orderType === 'dine-in' && !table && <p className="table-notice">Scan the QR code at your table to continue. Table numbers are detected automatically.</p>}
      {toast && <div className="order-toast" role="status"><span aria-hidden="true">✓</span>{toast}</div>}
      {filtered.length ? (
        <div className="menu-grid">
          {filtered.map((dish) => (
            <article className={`dish-card ${!dish.available ? 'unavailable' : ''}`} key={dish.id}>
              <div className="dish-image-wrap">
                <FoodImage src={dish.image} alt={`Food photo for ${dish.name}`} className="dish-image" />
                {dish.tag && <span className="dish-tag">{dish.tag}</span>}
                {!dish.available && <span className="sold-out">BACK SOON</span>}
              </div>
              <div className="dish-info">
                <div className="dish-category">{dish.category}</div>
                <div className="dish-title-row"><h2>{dish.name}</h2><strong>{formatRupees(dish.price)}</strong></div>
                <p>{dish.description}</p>
                <div className="dish-action">
                  {cart[dish.id] ? (
                    <QuantityControl quantity={cart[dish.id].quantity} onChange={(quantity) => setQuantity(dish, quantity)} label={`${dish.name} quantity`} />
                  ) : (
                    <button className="add-button" disabled={!dish.available} onClick={() => onAdd(dish)}>{dish.available ? 'Add to order' : 'Unavailable'} <span>+</span></button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-search"><span>✳</span><h2>Nothing on this plate.</h2><p>Try a different search or category.</p></div>}
      {itemCount > 0 && (
        <div className="floating-cart">
          <div>
            <span className="cart-count">{itemCount}</span>
            <span className="floating-cart-copy"><strong>Your order</strong><small>{itemCount} {itemCount === 1 ? 'item' : 'items'}</small></span>
          </div>
          <strong>{formatRupees(subtotal)}</strong>
          <Link className="button button-dark" to="/cart">See cart <span>↗</span></Link>
        </div>
      )}
    </main>
  );
}

function QuantityControl({ quantity, onChange, label }) {
  return (
    <div className="quantity-control" aria-label={label}>
      <button onClick={() => onChange(quantity - 1)} aria-label="Decrease quantity">−</button>
      <span aria-live="polite">{quantity}</span>
      <button onClick={() => onChange(quantity + 1)} aria-label="Increase quantity">+</button>
    </div>
  );
}

function CartPage({ cart, itemCount, subtotal, orderType, table, tableNotice, setQuantity, onMissingTable }) {
  const navigate = useNavigate();
  const items = Object.values(cart);
  const proceed = () => {
    if (!items.length) return;
    if (!orderType) {
      navigate('/', { state: { chooseOrder: true } });
      return;
    }
    if (orderType === 'dine-in' && !table) {
      onMissingTable('Scan the QR code at your table to attach its number to your order.');
      return;
    }
    if (!sessionStorage.getItem('7sky-checkout-attempt')) {
      const attemptId = window.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('7sky-checkout-attempt', attemptId);
    }
    sessionStorage.setItem('7sky-checkout-started', 'yes');
    navigate('/payment');
  };
  return (
    <main className="page-shell cart-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR GOOD THINGS</span>
        <h1>Your order<span>.</span></h1>
        {orderType && <p>Made for <strong>{orderType === 'dine-in' ? `Table ${table || 'QR required'}` : orderType}</strong> · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>}
      </div>
      {!items.length ? (
        <div className="empty-cart">
          <span className="empty-cart-icon">✳</span>
          <h2>Your order is empty.</h2>
          <p>Explore the menu and add a dish to get started.</p>
          <Link className="button button-dark" to="/menu">Back to the menu <span>↗</span></Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-items" aria-label="Cart items">
            {items.map((item) => (
              <article className="cart-row" key={item.id}>
                <FoodImage src={item.image} alt={`${item.name}; sample food photography`} className="cart-thumb" />
                <div className="cart-item-name"><h2>{item.name}</h2><span>{formatRupees(item.price)} each</span><button className="text-button remove-button" onClick={() => setQuantity(item, 0)}>Remove</button></div>
                <QuantityControl quantity={item.quantity} onChange={(quantity) => setQuantity(item, quantity)} label={`${item.name} quantity`} />
                <strong className="line-total">{formatRupees(item.price * item.quantity)}</strong>
              </article>
            ))}
            <Link to="/menu" className="continue-link">← Keep browsing</Link>
          </section>
          <aside className="order-summary">
            <span className="eyebrow">A LITTLE RECAP</span>
            <h2>Order summary</h2>
            <div className="summary-line"><span>Subtotal · {itemCount} items</span><strong>{formatRupees(subtotal)}</strong></div>
            <div className="summary-line"><span>Taxes &amp; fees</span><span>Calculated at the restaurant</span></div>
            <div className="summary-total"><span>Total</span><strong>{formatRupees(subtotal)}</strong></div>
            <p className="summary-note">Illustrative demo prices; taxes and service charges are not included.</p>
            {tableNotice && <p className="table-notice" role="status">{tableNotice}</p>}
            {orderType === 'dine-in' && !table && <p className="table-notice">Scan your table QR before placing a dine-in order.</p>}
            <button className="button button-dark full-button" onClick={proceed}>Place order <span>↗</span></button>
            <p className="demo-caption">Payment is simulated in this local demo; no funds are transferred.</p>
          </aside>
        </div>
      )}
    </main>
  );
}

function CheckoutPage({ cart, subtotal, orderType, orders, setOrders, setCart, table }) {
  const navigate = useNavigate();
  const started = sessionStorage.getItem('7sky-checkout-started') === 'yes';
  const [details, setDetails] = useState({ name: '', phone: '', address: '', instructions: '' });
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvv: '' });
  const [payerUpi, setPayerUpi] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const items = Object.values(cart);
  useEffect(() => {
    if (!submissionLock.current && (!started || !items.length || !orderType || (orderType === 'dine-in' && !table))) navigate('/cart', { replace: true });
  }, [started, items.length, orderType, table, navigate]);

  const update = (key, value) => {
    setDetails((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };
  const submitDemoPayment = (event) => {
    event.preventDefault();
    if (submissionLock.current) return;
    const nextErrors = {};
    if (!details.name.trim()) nextErrors.name = 'Please enter your name.';
    const phoneDigits = details.phone;
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) nextErrors.phone = 'Enter a valid Indian mobile number: 10 digits starting with 6–9.';
    if (orderType === 'delivery' && !details.address.trim()) nextErrors.address = 'Please enter a delivery address.';
    if (paymentMethod === 'qr') nextErrors.payment = 'QR payment is unavailable until a verified payment gateway is connected.';
    if (paymentMethod === 'card') {
      if (!card.name.trim()) nextErrors.cardName = 'Enter the demo cardholder name.';
      if (!validDemoCardNumber(card.number)) nextErrors.cardNumber = 'Enter a valid demo card number.';
      const [month, year] = card.expiry.split('/').map(Number);
      if (!month || month > 12 || !year || new Date(2000 + year, month, 0) < new Date()) nextErrors.expiry = 'Enter a valid future expiry date.';
      if (!/^\d{3,4}$/.test(card.cvv)) nextErrors.cvv = 'Enter a 3 or 4 digit demo security code.';
    }
    if (paymentMethod === 'upi' && !/^[\w.-]+@[\w.-]+$/.test(payerUpi.trim())) {
      nextErrors.upi = 'Enter a demo UPI ID such as guest@demo.';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    const attemptId = sessionStorage.getItem('7sky-checkout-attempt')
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('7sky-checkout-attempt', attemptId);
    const previouslyCompletedOrder = orders.find((savedOrder) => savedOrder.checkoutAttemptId === attemptId);
    if (previouslyCompletedOrder) {
      setCart({});
      sessionStorage.removeItem('7sky-checkout-started');
      sessionStorage.removeItem('7sky-checkout-attempt');
      navigate(`/confirmation/${encodeURIComponent(previouslyCompletedOrder.id)}`, { replace: true });
      return;
    }
    const id = `7S-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const order = {
      id,
      orderNumber: id,
      checkoutAttemptId: attemptId,
      items: items.map((item) => ({ ...item })),
      subtotal,
      orderType,
      table: orderType === 'dine-in' ? table : '',
      customerName: details.name.trim(),
      phone: phoneDigits,
      deliveryAddress: orderType === 'delivery' ? details.address.trim() : '',
      instructions: details.instructions.trim(),
      status: 'New',
      paymentStatus: 'Demo simulated success — not processed',
      paymentMethod,
      createdAt: new Date().toISOString(),
    };
    window.setTimeout(() => {
      const savedOrders = migrateOrders(readStorage('7sky-orders', orders));
      const duplicate = savedOrders.find((savedOrder) => savedOrder.checkoutAttemptId === attemptId);
      const nextOrders = duplicate ? savedOrders : [order, ...savedOrders];
      writeStorage('7sky-orders', nextOrders);
      setOrders(nextOrders);
      setCart({});
      setCard({ name: '', number: '', expiry: '', cvv: '' });
      setPayerUpi('');
      sessionStorage.removeItem('7sky-checkout-started');
      sessionStorage.removeItem('7sky-checkout-attempt');
      navigate(`/confirmation/${encodeURIComponent(duplicate?.id || id)}`, { replace: true });
    }, 350);
  };
  if (!started || !items.length || !orderType || (orderType === 'dine-in' && !table)) return null;

  return (
    <main className="page-shell checkout-page">
      <div className="page-heading">
        <span className="eyebrow">CHECKOUT · DEMO PAYMENT</span>
        <h1>Complete your <em>order.</em></h1>
        <p>Review your details and choose how to complete this simulated payment.</p>
      </div>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submitDemoPayment} noValidate>
          <div className="payment-demo-banner"><strong>DEMO PAYMENT MODE</strong><span>Payments are simulated. No funds move and no payment details are sent or saved.</span></div>
          <section className="checkout-section checkout-customer-section">
          <div className="checkout-section-heading"><span className="eyebrow">01 · CUSTOMER DETAILS</span><h2>Who is this order for?</h2></div>
          <div className="checkout-order-context">
            <div><span>Order type</span><strong>{orderTypeLabel(orderType)}</strong></div>
            {orderType === 'dine-in' && <div><span>Table</span><strong>{table}</strong></div>}
          </div>
          <label className="form-field">Name
            <input value={details.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label className="form-field">Mobile number
            <input type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} value={details.phone} onChange={(event) => update('phone', event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit Indian mobile number" autoComplete="tel-national" />
            {errors.phone && <span className="field-error">{errors.phone}</span>}
          </label>
          {orderType === 'delivery' && <label className="form-field">Delivery address
            <textarea rows="2" value={details.address} onChange={(event) => update('address', event.target.value)} autoComplete="street-address" />
            {errors.address && <span className="field-error">{errors.address}</span>}
          </label>}
          {orderType === 'dine-in' && <p className="table-notice">Dining at Table {table} · detected from your table QR code.</p>}
          <label className="form-field">A note for the kitchen <span className="optional">(optional)</span>
            <textarea rows="3" maxLength="300" value={details.instructions} onChange={(event) => update('instructions', event.target.value)} placeholder="Allergies or anything we should know" />
          </label>
          </section>
          <section className="checkout-section checkout-payment-section">
          <div className="checkout-section-heading"><span className="eyebrow">02 · PAYMENT</span><h2>Choose a payment method</h2><p>Demo only: never enter real card or banking details.</p></div>
          <fieldset className="payment-methods">
            <legend>Payment method</legend>
            <div className="payment-method-options">
              {[
                ['card', 'Card / debit'],
                ['upi', 'UPI'],
                ['qr', 'QR code'],
              ].map(([value, label]) => <button key={value} type="button" className={paymentMethod === value ? 'active' : ''} aria-pressed={paymentMethod === value} onClick={() => { setPaymentMethod(value); setErrors({}); }}>{label}</button>)}
            </div>
          </fieldset>
          {paymentMethod === 'card' && <section className="payment-fields" aria-label="Demo card details">
            <p className="payment-help">Demo only: use a fictitious card such as 4242 4242 4242 4242, Demo Guest, 12/30, 123. Never enter real card details.</p>
            <label className="form-field">Cardholder name<input autoComplete="off" value={card.name} onChange={(event) => setCard({ ...card, name: event.target.value })} placeholder="Demo Guest" />{errors.cardName && <span className="field-error">{errors.cardName}</span>}</label>
            <label className="form-field">Card number<input inputMode="numeric" autoComplete="off" value={card.number} onChange={(event) => setCard({ ...card, number: event.target.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim() })} placeholder="0000 0000 0000 0000" />{errors.cardNumber && <span className="field-error">{errors.cardNumber}</span>}</label>
            <div className="payment-field-row">
              <label className="form-field">Expiry<input inputMode="numeric" autoComplete="off" value={card.expiry} onChange={(event) => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); setCard({ ...card, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits }); }} placeholder="MM/YY" />{errors.expiry && <span className="field-error">{errors.expiry}</span>}</label>
              <label className="form-field">CVV<input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={card.cvv} onChange={(event) => setCard({ ...card, cvv: event.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="123" />{errors.cvv && <span className="field-error">{errors.cvv}</span>}</label>
            </div>
          </section>}
          {paymentMethod === 'upi' && <section className="payment-fields" aria-label="Demo UPI details">
            <p className="payment-help">Enter a fictitious payer ID for the demo. This does not open a UPI app or transfer money.</p>
            <label className="form-field">Demo UPI ID<input autoComplete="off" value={payerUpi} onChange={(event) => setPayerUpi(event.target.value)} placeholder="guest@demo" />{errors.upi && <span className="field-error">{errors.upi}</span>}</label>
          </section>}
          {paymentMethod === 'qr' && <section className="payment-qr-notice" aria-label="QR payment availability">
            <strong>QR payments are not configured</strong>
            <p>A verified payment gateway is required to create a payable QR request. This demo will not show a decorative or non-functional payment QR.</p>
          </section>}
          {errors.payment && <p className="form-error" role="alert">{errors.payment}</p>}
          <button className="button button-dark full-button" type="submit" disabled={submitting || paymentMethod === 'qr'}>{submitting ? 'Simulating payment…' : `Simulate payment · ${formatRupees(subtotal)}`} <span>↗</span></button>
          <p className="demo-caption">This clearly labelled simulation is not a real payment. No card or UPI details are stored.</p>
          </section>
        </form>
        <aside className="order-summary checkout-summary">
          <span className="eyebrow">ORDER REVIEW</span><h2>Your order</h2>
          {items.map((item) => <div className="summary-line" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{formatRupees(item.quantity * item.price)}</strong></div>)}
          <div className="summary-line"><span>Order type</span><strong>{orderTypeLabel(orderType)}</strong></div>
          {orderType === 'dine-in' && <div className="summary-line"><span>Table</span><strong>{table}</strong></div>}
          <div className="summary-total"><span>Total payable · demo</span><strong>{formatRupees(subtotal)}</strong></div>
          <p className="demo-caption">Illustrative demo prices only. No funds are transferred.</p>
          <div className="payment-status-note"><span className="payment-status-dot" />Demo payment status: simulated only</div>
        </aside>
      </div>
    </main>
  );
}

function ConfirmationPage({ orders }) {
  const { orderId } = useParams();
  const order = orders.find((item) => item.id === orderId);
  if (!order) return <main className="page-shell"><div className="empty-cart"><h2>We couldn’t find that order.</h2><Link className="button button-dark" to="/menu">Back to the menu</Link></div></main>;
  return (
    <main className="page-shell confirmation-page">
      <div className="confirmation-card">
        <span className="confirmation-success-icon" role="img" aria-label="Success">✓</span>
        <span className="eyebrow">DEMO PAYMENT SUCCESS · ORDER SENT</span>
        <h1>Payment <em>Successful</em></h1>
        <p className="confirmation-subtitle">Your demo payment is complete. Your order has been saved and sent to the kitchen board in this browser.</p>
        <div className="confirmation-number"><span>ORDER NUMBER</span><strong>{order.orderNumber}</strong></div>
        <div className="confirmation-details">
          <div><span>Order type</span><strong>{orderTypeLabel(order.orderType)}{order.table ? ` · Table ${order.table}` : ''}</strong></div>
          <div><span>Payment method</span><strong>{paymentMethodLabel(order.paymentMethod)}</strong></div>
          <div><span>Payment status</span><strong>Simulated demo payment · not charged</strong></div>
          <div><span>Customer</span><strong>{order.customerName}<br />{order.phone}</strong></div>
          <div><span>Order status</span><strong>{order.status} · sent to kitchen</strong></div>
          {order.deliveryAddress && <div className="confirmation-delivery-address"><span>Delivery address</span><strong>{order.deliveryAddress}</strong></div>}
        </div>
        <div className="confirmation-items">{order.items.map((item) => <p key={item.id}>{item.quantity} × {item.name}<span>{formatRupees(item.price * item.quantity)}</span></p>)}</div>
        <div className="confirmation-total"><span>Demo total</span><strong>{formatRupees(order.subtotal)}</strong></div>
        <p className="demo-caption">No real payment was taken. Orders are stored locally and will only appear on the kitchen dashboard in this browser.</p>
        <Link to="/" className="button button-dark">Return to homepage <span>↗</span></Link>
      </div>
    </main>
  );
}

function ProtectedRoute({ user, role, children }) {
  const location = useLocation();
  if (!user || user.role !== role) return <Navigate to={`/login/${role}`} replace state={{ from: location.pathname }} />;
  return children;
}

function LoginPage({ setUser }) {
  const { role } = useParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const validRole = role === 'owner' || role === 'kitchen';
  const portalName = role === 'owner' ? 'Owner portal' : 'Kitchen portal';
  const portalTitle = role === 'owner' ? 'A clearer view of your restaurant.' : 'Good service starts at the pass.';
  const portalDescription = role === 'owner'
    ? 'Review orders, manage the menu and prepare your tables from one considered workspace.'
    : 'Keep new orders moving, coordinate preparation and make every service feel seamless.';
  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (!validRole) return <Navigate to="/" replace />;
  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your demo username and password.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const account = demoUsers[username.trim().toLowerCase()];
      if (!account || account.password !== password || account.role !== role) {
        setError(`Those details don’t match the ${role} demo login.`);
        setBusy(false);
        return;
      }
      setUser({ username: username.trim().toLowerCase(), role });
      navigate(role === 'owner' ? '/owner' : '/kitchen', { replace: true });
    }, 350);
  };
  return (
    <main className={`page-shell login-page login-page-${role}`}>
      <div className="login-portal">
        <aside className="login-brand-panel">
          <img className="login-wordmark" src={brandLogo} alt="7th Sky" />
          <span className="eyebrow">{portalName}</span>
          <h1>{portalTitle}</h1>
          <p>{portalDescription}</p>
          <div className="login-portal-note"><span className="login-portal-dot" />{role === 'owner' ? 'Restaurant management' : 'Service operations'} · local demo</div>
        </aside>
        <section className="login-card">
          <span className="eyebrow">TEAM SIGN IN</span>
          <h2>Welcome back.</h2>
          <p>Sign in to continue to the {role} workspace.</p>
        <form onSubmit={submit} noValidate>
          <label className="form-field">Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
          <label className="form-field">Password
            <span className="password-wrap"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" className="text-button" onClick={() => setShowPassword((show) => !show)}>{showPassword ? 'Hide' : 'Show'}</button></span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark full-button" disabled={busy}>{busy ? 'Checking…' : `Enter ${role} portal`} <span>↗</span></button>
        </form>
        <div className="credential-hint"><strong>Demo credentials</strong><span>{role} / {demoUsers[role].password}</span></div>
        <p className="login-local-note">Demo access is stored in this browser; this is not secure authentication.</p>
        {notice && <span role="status">{notice}</span>}
        </section>
      </div>
    </main>
  );
}

function KitchenPage({ orders, setOrders }) {
  const [filter, setFilter] = useState('Active');
  const filtered = orders.filter((order) => filter === 'All' || (filter === 'Active' ? order.status !== 'Completed' : order.status === 'Completed'));
  const updateStatus = (id, status) => setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
  const activeOrders = orders.filter((order) => order.status !== 'Completed');
  const newOrders = orders.filter((order) => order.status === 'New');
  const preparingOrders = orders.filter((order) => order.status === 'Preparing');
  const readyOrders = orders.filter((order) => order.status === 'Ready');
  return (
    <main className="page-shell dashboard-page kitchen-page">
      <div className="dashboard-heading">
        <div><span className="eyebrow">SERVICE OVERVIEW</span><h1>The kitchen <em>pass.</em></h1><p>Paid demo orders are stored in this browser only. This board does not sync across devices.</p></div>
        <span className="demo-pill">LOCAL DEMO · SAME BROWSER</span>
      </div>
      <section className="kitchen-stats" aria-label="Order status summary">
        <div className="kitchen-stat kitchen-stat-new"><span>Needs attention</span><strong>{newOrders.length}</strong><small>New orders</small></div>
        <div className="kitchen-stat"><span>In preparation</span><strong>{preparingOrders.length}</strong><small>Being prepared</small></div>
        <div className="kitchen-stat"><span>Ready to serve</span><strong>{readyOrders.length}</strong><small>Awaiting collection</small></div>
        <div className="kitchen-stat"><span>Active orders</span><strong>{activeOrders.length}</strong><small>Not yet completed</small></div>
      </section>
      <div className="dashboard-toolbar kitchen-toolbar">
        <div className="tabs" role="tablist" aria-label="Filter kitchen orders">
          {['Active', 'Completed', 'All'].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'All' ? 'All orders' : item}</button>)}
        </div>
        <span>{filtered.length} {filtered.length === 1 ? 'order' : 'orders'}</span>
      </div>
      {filtered.length ? <div className="kitchen-grid">{filtered.map((order) => <KitchenOrder key={order.id} order={order} onStatus={updateStatus} />)}</div> : <div className="dashboard-empty"><span>✳</span><h2>All caught up.</h2><p>There are no {filter.toLowerCase()} orders to show.</p></div>}
    </main>
  );
}

function KitchenOrder({ order, onStatus }) {
  const statusIndex = orderStatuses.indexOf(order.status);
  const nextStatus = statusIndex >= 0 ? orderStatuses[statusIndex + 1] : undefined;
  const nextAction = nextStatus
    ? {
      Accepted: 'Accept order',
      Preparing: 'Start preparing',
      Ready: 'Mark ready',
      Completed: 'Complete order',
    }[nextStatus]
    : undefined;
  return (
    <article className={`kitchen-order ${order.status === 'New' ? 'kitchen-order-new' : ''}`}>
      <div className="kitchen-order-top"><div><span className="eyebrow">{orderTypeLabel(order.orderType)}{order.table ? ` · Table ${order.table}` : ''}</span><h2>{order.orderNumber}</h2></div><span className={`status-badge status-${order.status.toLowerCase()}`}>{order.status}</span></div>
      <div className="kitchen-meta"><strong>{order.customerName}</strong><span>{new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      <div className="kitchen-contact"><span>Customer phone</span><a href={`tel:${order.phone}`}>{order.phone}</a></div>
      {order.deliveryAddress && <div className="kitchen-instructions"><span>DELIVERY ADDRESS</span><p>{order.deliveryAddress}</p></div>}
      <section className="kitchen-items" aria-label="Ordered items"><h3>Order items</h3>{order.items.map((item) => <p key={item.id}><strong>{item.quantity}×</strong> {item.name}</p>)}</section>
      {order.instructions && <div className="kitchen-instructions"><span>NOTE FOR THE KITCHEN</span><p>{order.instructions}</p></div>}
      <div className="kitchen-order-bottom"><div><span>PAYMENT STATUS</span><strong>{order.paymentStatus}</strong></div><label>UPDATE STATUS<select value={order.status} onChange={(event) => onStatus(order.id, event.target.value)}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div>
      <div className="kitchen-order-total"><span>Demo order total</span><strong>{formatRupees(order.subtotal)}</strong></div>
      {nextStatus && <button className="button button-dark kitchen-next-action" onClick={() => onStatus(order.id, nextStatus)}>{nextAction}<span>→</span></button>}
    </article>
  );
}

function OwnerPage({ orders, menu, setMenu, categories, tableCount, setTableCount }) {
  const [tab, setTab] = useState('Overview');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All time');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', category: categories[0] || '', price: '', image: '', available: true, tag: '' });
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString());
  const popular = useMemo(() => {
    const counts = {};
    orders.forEach((order) => order.items.forEach((item) => { counts[item.name] = (counts[item.name] || 0) + item.quantity; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [orders]);
  const filteredOrders = orders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    const matchesStatus = statusFilter === 'All' || order.status === statusFilter;
    const matchesDate = dateFilter === 'All time'
      || (dateFilter === 'Today' && createdAt.toDateString() === new Date().toDateString())
      || (dateFilter === 'Last 7 days' && Date.now() - createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000 && createdAt.getTime() <= Date.now());
    return matchesStatus && matchesDate;
  });
  const openNew = () => {
    setEditing('new');
    setForm({ name: '', description: '', category: categories[0] || '', price: '', image: '', available: true, tag: '' });
  };
  const editDish = (dish) => {
    setEditing(dish.id);
    setForm({ ...dish, price: String(dish.price) });
  };
  const saveDish = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim() || Number(form.price) <= 0) return;
    const dish = { ...form, id: editing === 'new' ? `dish-${Date.now()}` : editing, name: form.name.trim(), price: Number(form.price) };
    setMenu((current) => editing === 'new' ? [...current, dish] : current.map((item) => item.id === editing ? dish : item));
    setEditing(null);
  };
  const deleteDish = (id) => {
    if (window.confirm('Remove this dish from the sample menu?')) setMenu((current) => current.filter((dish) => dish.id !== id));
  };
  const toggleDish = (id) => setMenu((current) => current.map((dish) => dish.id === id ? { ...dish, available: !dish.available } : dish));
  return (
    <main className="page-shell dashboard-page owner-page">
      <div className="dashboard-heading"><div><span className="eyebrow">7TH SKY · OWNER PORTAL</span><h1>Restaurant <em>overview.</em></h1><p>Orders, menu and table setup for this browser’s local demo.</p></div><span className="demo-pill">LOCAL DEMO · SAME BROWSER</span></div>
      <div className="tabs owner-tabs" role="tablist">
        {['Overview', 'Orders', 'Menu', 'Tables & QR'].map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === 'Overview' && <>
        <div className="stats-grid">
          <StatCard label="All sample orders" value={orders.length} note="Across this browser" />
          <StatCard label="Today’s orders" value={todayOrders.length} note="Since midnight" />
          <StatCard label="Demo revenue" value={formatRupees(0)} note="No verified payments" />
          <StatCard label="In the kitchen" value={orders.filter((order) => !['Ready', 'Completed'].includes(order.status)).length} note="Not yet ready or completed" />
        </div>
        <section className="owner-overview-grid">
          <div className="owner-panel"><span className="eyebrow">RECENT ORDERS</span><h2>On the books</h2>{orders.slice(0, 5).length ? orders.slice(0, 5).map((order) => <div className="recent-order" key={order.id}><div><strong>{order.orderNumber}</strong><span>{orderTypeLabel(order.orderType)}{order.table ? ` · Table ${order.table}` : ''} · {new Date(order.createdAt).toLocaleDateString('en-IN')}</span></div><span className={`status-badge status-${order.status.toLowerCase()}`}>{order.status}</span></div>) : <p className="muted-copy">No sample orders yet. Try placing one from the menu.</p>}</div>
          <div className="owner-panel"><span className="eyebrow">MOST ORDERED</span><h2>People love</h2>{popular.length ? popular.map(([name, count], index) => <div className="popular-row" key={name}><span>0{index + 1}</span><strong>{name}</strong><span>{count} {count === 1 ? 'order' : 'orders'}</span></div>) : <p className="muted-copy">Popular dishes will appear after the first sample order.</p>}</div>
        </section>
      </>}
      {tab === 'Orders' && <section className="owner-panel order-table-panel"><div className="panel-title-row"><div><span className="eyebrow">ORDER HISTORY</span><h2>Every good thing, logged.</h2></div><div className="filter-group"><label className="filter-select">Date <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>{['All time', 'Today', 'Last 7 days'].map((date) => <option key={date}>{date}</option>)}</select></label><label className="filter-select">Status <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All', ...orderStatuses].map((status) => <option key={status}>{status}</option>)}</select></label></div></div>
        {filteredOrders.length ? <div className="table-scroll"><table><thead><tr><th>Order</th><th>Time</th><th>Type</th><th>Amount</th><th>Payment</th><th>Kitchen status</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{orderTypeLabel(order.orderType)}{order.table ? ` · Table ${order.table}` : ''}</td><td>{formatRupees(order.subtotal)}</td><td>{order.paymentStatus}</td><td><span className={`status-badge status-${order.status.toLowerCase()}`}>{order.status}</span></td></tr>)}</tbody></table></div> : <p className="muted-copy">No orders match this filter.</p>}
      </section>}
      {tab === 'Menu' && <section className="owner-panel owner-menu-panel"><div className="panel-title-row"><div><span className="eyebrow">ILLUSTRATIVE MENU</span><h2>Keep the good things coming.</h2></div><button className="button button-dark" onClick={openNew}>Add dish <span>+</span></button></div>
        <div className="category-management"><span className="eyebrow">MENU CATEGORIES</span><div className="category-chips">{categories.map((category) => <span key={category}>{category}</span>)}</div><p className="muted-copy">Menu categories are fixed to Biriyani and Mandi.</p></div>
        {editing && <form className="dish-editor" onSubmit={saveDish}>
          <h3>{editing === 'new' ? 'Add a dish' : 'Edit dish'}</h3>
          <div className="editor-grid">
            <label className="form-field">Dish name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className="form-field">Price (₹)<input type="number" min="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
            <label className="form-field">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="form-field">Image path or URL<input type="text" value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="/images/menu/… or https://…" /></label>
            <label className="form-field editor-description">Description<textarea rows="2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>
          </div>
          <div className="editor-actions"><label className="check-label"><input type="checkbox" checked={form.available} onChange={(event) => setForm({ ...form, available: event.target.checked })} /> Available to order</label><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button><button className="button button-dark">{editing === 'new' ? 'Add dish' : 'Save changes'}</button></div>
        </form>}
        <div className="owner-menu-list">{menu.map((dish) => <article key={dish.id} className="owner-dish"><FoodImage src={dish.image} alt={dish.name} className="owner-dish-thumb" /><div className="owner-dish-details"><strong>{dish.name}</strong><span>{dish.category} · {formatRupees(dish.price)} · {dish.available ? 'Available' : 'Unavailable'}</span></div><button className="text-button" onClick={() => toggleDish(dish.id)}>{dish.available ? 'Disable' : 'Enable'}</button><button className="text-button" onClick={() => editDish(dish)}>Edit</button><button className="text-button delete-action" onClick={() => deleteDish(dish.id)}>Remove</button></article>)}</div>
      </section>}
      {tab === 'Tables & QR' && <section className="owner-panel table-qr-panel">
        <div className="panel-title-row"><div><span className="eyebrow">DINE-IN SETUP</span><h2>One QR for every table.</h2><p className="muted-copy">Each code opens the ordering page with its table number detected automatically.</p></div></div>
        <label className="form-field table-count-field">Configured tables
          <input type="number" min="1" max={maxTables} value={tableCount} onChange={(event) => {
            const count = Number(event.target.value);
            if (Number.isInteger(count) && count > 0 && count <= maxTables) setTableCount(count);
          }} />
        </label>
        <p className="demo-caption">Table QR codes point to this site’s current origin. Configure your production domain and print the codes before service.</p>
        <div className="table-qr-grid">{Array.from({ length: tableCount }, (_, index) => {
          const number = index + 1;
          const url = new URL(window.location.href);
          url.pathname = '/';
          url.search = `?table=${number}`;
          url.hash = '';
          return <article className="table-qr-card" key={number}><h3>Table {number}</h3><QrCodeImage value={url.toString()} label={`Table ${number}`} /><code>{url.toString()}</code></article>;
        })}</div>
        <button type="button" className="button button-dark qr-print-button" onClick={() => window.print()}>Print table codes</button>
      </section>}
    </main>
  );
}

function StatCard({ label, value, note }) {
  return <article className="stat-card"><span className="eyebrow">{label}</span><strong>{value}</strong><span>{note}</span></article>;
}

function HomeFooter() {
  return <Footer variant="home" />;
}

function InnerPageFooter() {
  return <Footer variant="inner" />;
}

function Footer({ variant }) {
  return (
    <footer className={`site-footer site-footer-${variant}`}>
      <div className="footer-main">
        <Link className="brand footer-brand" to="/" aria-label="7th Sky home"><img className="brand-logo" src={brandLogo} alt="7th Sky" /></Link>
        <p>Come hungry.<br />Leave room for one more.</p>
        <div className="footer-links">
          {variant === 'home' ? <><Link to="/#story">Our story <span>↗</span></Link><Link to="/#signature">The menu <span>↗</span></Link><Link to="/#order">How to order <span>↗</span></Link></> : <><Link to="/menu">Menu <span>↗</span></Link><Link to="/cart">Your cart <span>↗</span></Link></>}
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 7th Sky · Ordering demo</span><span>Demo prices · Simulated payments only</span></div>
    </footer>
  );
}

export default App;
