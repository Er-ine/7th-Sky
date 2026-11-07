import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from './api.js';
import { brandLogo, formatRupees, heroSlides, initialCategories, initialMenu, readStorage, uploadedMenuImageReplacements, writeStorage } from './data.js';

const statusFlows = {
  'dine-in': ['Placed', 'Preparing', 'Ready', 'Delivered', 'Completed'],
  delivery: ['Placed', 'Preparing', 'Ready', 'On the way', 'Completed'],
  takeaway: ['Placed', 'Preparing', 'Ready', 'At reception', 'Completed'],
};
const allStatuses = ['Placed', 'Preparing', 'Ready', 'Delivered', 'On the way', 'At reception', 'Completed'];
const customerStatusLabels = {
  Placed: 'Order received',
  Preparing: 'Being prepared',
  Ready: 'Ready',
  Delivered: 'Served at your table',
  'On the way': 'On the way',
  'At reception': 'Ready for pickup',
  Completed: 'Completed',
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

function statusFlowFor(orderType) {
  return statusFlows[orderType] || statusFlows.takeaway;
}

function statusClass(status) {
  return `status-${String(status).toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

function newAttemptId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function paymentMethodLabel(method, orderType) {
  if (orderType === 'dine-in') return 'Pay at restaurant';
  if (method === 'card') return 'Credit / Debit Card';
  if (method === 'upi') return 'UPI';
  if (method === 'qr') return 'Scan QR';
  return 'In-app payment';
}

function ArrowIcon({ direction = 'up-right' }) {
  const paths = {
    'up-right': 'M6 18 18 6M7 6h11v11',
    left: 'M19 12H5m0 0 7-7m-7 7 7 7',
    right: 'M5 12h14m0 0-7-7m7 7-7 7',
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d={paths[direction]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SparkleIcon({ className = '' }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M16 2.5 19.2 12.8 29.5 16l-10.3 3.2L16 29.5l-3.2-10.3L2.5 16l10.3-3.2L16 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

function PlateIcon() {
  return <svg className="empty-cart-icon" aria-hidden="true" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="1.5" /><circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="1.2" /><path d="M5 9v12m4-12v12M7 21v19m34-31-5 13h5v17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HeadingAccent() {
  return <svg className="heading-accent" aria-hidden="true" viewBox="0 0 72 12" fill="none"><path d="M2 8c8-6 13-6 20 0s12 6 19 0 12-6 20 0 8 4 9 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function EdgeDecorations() {
  return (
    <div className="edge-decorations" aria-hidden="true">
      <span className="edge-glow edge-glow-left" />
      <span className="edge-glow edge-glow-right" />
      <SparkleIcon className="edge-art edge-art-left" />
      <svg className="edge-art edge-art-right edge-plate" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="29" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="40" cy="40" r="21" stroke="currentColor" strokeWidth="1" />
        <path d="M40 11c5 12 5 46 0 58M11 40c12-5 46-5 58 0" stroke="currentColor" strokeWidth=".8" />
      </svg>
      <svg className="edge-art edge-art-right edge-leaf" viewBox="0 0 64 84" fill="none">
        <path d="M52 5C16 9 4 27 9 48c4 18 23 25 36 13C59 48 59 22 52 5Z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M11 67C23 48 35 33 51 9m-29 43 2-17m8 6 16-2m-30 25 19-4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      <svg className="edge-art edge-art-left edge-spiral" viewBox="0 0 72 72" fill="none">
        <path d="M36 8c-15 0-27 12-27 27s12 27 27 27 27-12 27-27S51 8 36 8Zm0 10c9 0 17 8 17 17s-8 17-17 17-17-8-17-17 8-17 17-17Zm0 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="edge-dot edge-dot-one" />
      <span className="edge-dot edge-dot-two" />
      <span className="edge-dot edge-dot-three" />
    </div>
  );
}

function BrandMarquee() {
  const items = ['Fresh Biriyani', 'Royal Mandi', 'Made with love', 'Dine among the stars'];
  return (
    <div className="brand-marquee" aria-label={items.join(' · ')}>
      <div className="brand-marquee-track">
        {[0, 1].map((copy) => (
          <div className="brand-marquee-group" key={copy} aria-hidden={copy === 1}>
            {items.map((item) => <span className="brand-marquee-item" key={item}><span>{item}</span><svg aria-hidden="true" viewBox="0 0 8 8"><circle cx="4" cy="4" r="2" fill="currentColor" /></svg></span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderBurst() {
  return <div className="order-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <SparkleIcon key={index} className={`burst-spark burst-spark-${index + 1}`} />)}</div>;
}

function validTable(value, count) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= count ? String(parsed) : '';
}

function orderTypeLabel(type) {
  if (type === 'dine-in') return 'Dine-in';
  if (type === 'delivery') return 'Delivery';
  return 'Takeaway';
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

function FoodImage({ src, fallbackSrc, alt, className = '', allowFallback = true, ariaHidden = false }) {
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
      aria-hidden={ariaHidden}
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
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');
  const menuCategories = initialCategories;
  const [user, setUser] = useState(() => {
    const saved = readStorage('7sky-user', null);
    return saved?.token ? saved : null;
  });
  const [toast, setToast] = useState('');
  const [cartPulse, setCartPulse] = useState(false);
  const toastTimeout = useRef(0);
  const cartPulseTimeout = useRef(0);

  useEffect(() => {
    if (location.pathname === '/kitchen' || location.pathname === '/login/kitchen') document.title = 'The Kitchen | 7th Sky';
    else if (location.pathname === '/owner' || location.pathname === '/login/owner') document.title = 'Owner Desk | 7th Sky';
    else document.title = '7th Sky | Taste worth looking up for';
  }, [location.pathname]);

  useEffect(() => writeStorage('7sky-cart', cart), [cart]);
  useEffect(() => writeStorage('7sky-order-type', orderType), [orderType]);
  useEffect(() => writeStorage('7sky-table', table), [table]);
  useEffect(() => writeStorage('7sky-table-count', tableCount), [tableCount]);
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
        if (event.key === '7sky-menu' && event.newValue) setMenu(migrateMenu(JSON.parse(event.newValue), true));
      } catch (error) {
        console.error('Could not sync restaurant data from another tab.', error);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (!user?.token || !['kitchen', 'owner'].includes(user.role)) {
      setOrders([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api('/api/orders', { token: user.token });
        if (cancelled) return;
        setOrders(list);
        setOrdersError('');
      } catch (error) {
        if (cancelled) return;
        if (error.status === 401) setUser(null);
        else setOrdersError(error.message);
      }
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.token, user?.role]);

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
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;
    const elements = document.querySelectorAll([
      '.story-section',
      '.signature-section',
      '.order-section',
      '.menu-intro',
      '.menu-toolbar',
      '.menu-grid',
      '.cart-page .page-heading',
      '.cart-layout',
      '.empty-cart',
      '.checkout-page .page-heading',
      '.checkout-layout',
      '.confirmation-card',
    ].join(', '));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
    elements.forEach((element) => {
      element.classList.add('reveal-on-scroll');
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [location.pathname]);
  useEffect(() => () => {
    window.clearTimeout(toastTimeout.current);
    window.clearTimeout(cartPulseTimeout.current);
  }, []);

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
    window.clearTimeout(cartPulseTimeout.current);
    setCartPulse(true);
    cartPulseTimeout.current = window.setTimeout(() => setCartPulse(false), 520);
  };
  const logout = () => setUser(null);
  const isHome = location.pathname === '/';
  const isDashboard = location.pathname === '/kitchen' || location.pathname === '/owner';
  const isOperations = isDashboard || location.pathname === '/login/kitchen' || location.pathname === '/login/owner';
  const siteHeader = isHome
    ? <HomeHeader itemCount={itemCount} user={user} onLogout={logout} table={table} cartPulse={cartPulse} />
    : isOperations
      ? <DashboardHeader user={user} onLogout={logout} />
      : <InnerPageHeader itemCount={itemCount} user={user} onLogout={logout} table={table} cartPulse={cartPulse} />;
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
              setCart={setCart}
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
              setCart={setCart}
            />
          }
        />
        <Route path="/confirmation/:orderId" element={<OrderStatusPage mode="confirmation" />} />
        <Route path="/order/:orderId" element={<OrderStatusPage mode="track" />} />
        <Route path="/track" element={<TrackLookupPage />} />
        <Route
          path="/login/:role"
          element={<LoginPage setUser={setUser} />}
        />
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute user={user} role="kitchen">
              <KitchenPage orders={orders} setOrders={setOrders} token={user?.token} error={ordersError} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner"
          element={
            <ProtectedRoute user={user} role="owner">
              <OwnerPage orders={orders} error={ordersError} menu={menu} setMenu={setMenu} categories={menuCategories} tableCount={tableCount} setTableCount={setTableCount} />
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
        <Link className="operations-brand" to={dashboardPath} aria-label={role === 'owner' ? '7th Sky owner dashboard' : '7th Sky The Kitchen'}>
          <img className="brand-logo" src={brandLogo} alt="7th Sky" />
          <span>{role === 'owner' ? 'OWNER DESK' : 'THE KITCHEN'}</span>
        </Link>
        <div className="operations-heading">
          <span className="operations-indicator" />
          <span>{role === 'owner' ? 'Owner dashboard' : 'The Kitchen'}</span>
        </div>
        {user ? <button className="operations-logout" onClick={onLogout}>Log out <ArrowIcon /></button> : <span className="operations-access">Team access</span>}
      </div>
    </header>
  );
}

function Header({ itemCount, user, onLogout, table, variant, cartPulse }) {
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
          {variant === 'home' && <Link to="/#order">Order</Link>}
          <Link to="/track">Track order</Link>
          <Link className={`nav-cart${cartPulse ? ' cart-wiggle' : ''}`} to="/cart">Cart <span>{itemCount}</span></Link>
        </nav>
        <div className="login-wrap">
          {user ? (
            <div className="signed-in">
              <Link to={user.role === 'owner' ? '/owner' : '/kitchen'}>{user.role === 'owner' ? 'Owner desk' : 'The Kitchen'}</Link>
              <button className="login-button" onClick={onLogout}>Log out</button>
            </div>
          ) : (
            <>
              <button className="login-button" onClick={() => setLoginOpen((open) => !open)} aria-expanded={loginOpen}>Login <ChevronIcon /></button>
              {loginOpen && (
                <div className="login-menu">
                  <span className="eyebrow">TEAM ACCESS</span>
                  <Link to="/login/kitchen">The Kitchen login <ArrowIcon /></Link>
                  <Link to="/login/owner">Owner login <ArrowIcon /></Link>
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
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const interval = window.setInterval(() => setActive((current) => (current + 1) % heroSlides.length), 7000);
    return () => window.clearInterval(interval);
  }, [active, paused]);
  const featuredDishes = menu.filter((dish) => dish.available).slice(0, 3);
  const storyDish = menu.find((dish) => dish.id === 'beef-mandi') || menu[0];
  const deliveryDish = menu.find((dish) => dish.id === 'chicken-biriyani') || menu[0];
  return (
    <main className="homepage-main">
      <EdgeDecorations />
      <section
        className="hero"
        aria-label="7th Sky restaurant slideshow"
        aria-roledescription="carousel"
        tabIndex={0}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setActive((current) => (current + heroSlides.length - 1) % heroSlides.length);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            setActive((current) => (current + 1) % heroSlides.length);
          }
        }}
      >
        {heroSlides.map((item, index) => (
          <FoodImage
            key={item.image}
            src={item.image}
            alt={item.alt}
            className={`hero-image${index === active ? ' is-active' : ''}`}
            allowFallback={false}
            ariaHidden={index !== active}
          />
        ))}
        <div className="hero-shade" />
        <button className="hero-arrow hero-arrow-previous" onClick={() => setActive((current) => (current + heroSlides.length - 1) % heroSlides.length)} aria-label="Previous slide"><ArrowIcon direction="left" /></button>
        <button className="hero-arrow hero-arrow-next" onClick={() => setActive((current) => (current + 1) % heroSlides.length)} aria-label="Next slide"><ArrowIcon direction="right" /></button>
        <div className="hero-copy">
          <h1>Taste worth looking up for.</h1>
          <Link to="/menu" className="button button-light">Discover the new menu <ArrowIcon /></Link>
        </div>
        <div className="hero-bottom">
          <span className="photo-disclosure">A GLIMPSE OF GOOD THINGS</span>
          <div className="slide-controls" aria-label="Slideshow controls">
            <div className="slide-dots">
              {heroSlides.map((item, index) => <button key={item.image} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Show slide ${index + 1}`} aria-current={index === active ? 'true' : undefined} />)}
            </div>
          </div>
        </div>
      </section>

      {tableNotice && <div className="section-wrap"><p className="table-notice" role="status">{tableNotice}</p></div>}

      <section className="story-section section-wrap" id="story">
        <div className="story-copy">
          <span className="eyebrow">A PLACE AT THE TABLE</span>
          <h2>Make an evening<br />of <em>something good.</em></h2>
          <HeadingAccent />
          <p>At 7th Sky, biriyani, mandi and good company turn any meal into a moment worth savouring.</p>
          <Link to="/menu" className="text-link">Take a look at the menu <ArrowIcon /></Link>
        </div>
        <div className="story-visual">
          <FoodImage src={storyDish?.image} alt="Beef Mandi from the 7th Sky menu" className="story-photo" />
          <span className="photo-caption">BEEF MANDI · FROM OUR MENU</span>
        </div>
      </section>

      <BrandMarquee />

      <section className="signature-section" id="signature">
        <div className="section-wrap">
          <div className="signature-heading">
            <div><span className="eyebrow">A FIRST LOOK</span><h2>Start with<br /><em>something lovely.</em></h2><HeadingAccent /></div>
            <Link to="/menu" className="text-link">The full menu <ArrowIcon /></Link>
          </div>
          <div className="signature-grid">
            {featuredDishes[0] && <article className="signature-feature">
              <FoodImage src={featuredDishes[0].image} fallbackSrc={featuredDishes[0].imageFallback} alt={`Food photograph of ${featuredDishes[0].name}`} className="signature-image" />
              <div className="signature-overlay"><span className="eyebrow light">{featuredDishes[0].category}</span><h3>{featuredDishes[0].name}</h3><span>{formatRupees(featuredDishes[0].price)}</span></div>
            </article>}
            <div className="signature-side">
              {featuredDishes.slice(1).map((dish) => <article className="signature-small" key={dish.id}>
                <FoodImage src={dish.image} fallbackSrc={dish.imageFallback} alt={`Food photograph of ${dish.name}`} className="signature-small-image" />
                <div><span className="eyebrow">{dish.category}</span><h3>{dish.name}</h3><span>{formatRupees(dish.price)}</span></div>
              </article>)}
            </div>
          </div>
        </div>
      </section>

      <section className="order-section" id="order">
        <div className="section-wrap order-wrap">
          <div className="order-intro">
            <span className="eyebrow">MADE FOR YOUR KIND OF EVENING</span>
            <h2>Here or<br /><em>on the way.</em></h2>
            <HeadingAccent />
            <p>Choose how you would like to order. You can change your mind later.</p>
          </div>
          <div className="order-options">
            <button className="order-card takeaway-card" onClick={() => onChoose('takeaway')}>
              <FoodImage src={heroSlides[1].image} alt="" className="order-card-image" allowFallback={false} />
              <span className="order-number">01 · TAKE IT WITH YOU</span>
              <strong>Takeaway</strong>
              <span>Order ahead. Take the good part home.</span>
              <i aria-hidden="true"><ArrowIcon /></i>
            </button>
            <button className="order-card dinein-card" onClick={() => onChoose('dine-in')}>
              <FoodImage src={heroSlides[2].image} alt="" className="order-card-image" allowFallback={false} />
              <span className="order-number">02 · TAKE YOUR TIME</span>
              <strong>Dine in</strong>
              <span>Settle in. We’ll bring it to the table.</span>
              <i aria-hidden="true"><ArrowIcon /></i>
            </button>
            <button className="order-card delivery-card" onClick={() => onChoose('delivery')}>
              <FoodImage src={deliveryDish?.image} alt="" className="order-card-image" />
              <span className="order-number">03 · AT YOUR DOOR</span>
              <strong>Delivery</strong>
              <span>Bring a little 7th Sky to your table at home.</span>
              <i aria-hidden="true"><ArrowIcon /></i>
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
    <main className={`page-shell menu-page${itemCount > 0 ? ' has-cart-summary' : ''}`}>
      <EdgeDecorations />
      <div className="menu-intro">
        <span className="eyebrow">A TASTE OF 7TH SKY</span>
        <h1>Made for<br /><em>moments worth savouring.</em></h1>
        <HeadingAccent />
        <p>Settle in with fragrant biriyani, slow-cooked mandi and a little something to remember.</p>
        <span className="menu-price-note">OUR MENU · PRICES IN ₹</span>
      </div>
      <div className="menu-toolbar">
        <div className="category-list" role="group" aria-label="Filter menu category">
          {['All', ...categories].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <label className="search-field"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.6" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find something lovely" aria-label="Search menu" /></label>
      </div>
      {orderType && <div className="order-type-note"><span>YOUR ORDER</span> {orderType === 'dine-in' ? (table ? `Dining at Table ${table}` : 'Dine in · scan your table QR') : orderType === 'delivery' ? 'Delivery' : 'Takeaway'} <Link to="/">Change</Link></div>}
      {tableNotice && !table && <p className="table-notice" role="status">{tableNotice}</p>}
      {orderType === 'dine-in' && !table && <p className="table-notice">Scan the QR code at your table to continue. Table numbers are detected automatically.</p>}
      {toast && <div className="order-toast" role="status"><span className="toast-check"><CheckIcon /></span>{toast}</div>}
      {filtered.length ? (
        <div className="menu-grid">
          {filtered.map((dish, index) => (
            <article className={`dish-card ${!dish.available ? 'unavailable' : ''}`} key={dish.id}>
              <div className="dish-image-wrap">
                <FoodImage src={dish.image} alt={`Food photo for ${dish.name}`} className="dish-image" />
                {dish.tag && <span className="dish-tag">{dish.tag}</span>}
                {dish.available && index < 2 && <span className="dish-ribbon">{index === 0 ? 'Chef’s pick' : 'Bestseller'}</span>}
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
                    <button className="add-button" disabled={!dish.available} onClick={() => onAdd(dish)}>{dish.available ? 'Add to order' : 'Unavailable'} <span aria-hidden="true">+</span></button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-search"><SparkleIcon className="empty-search-mark" /><h2>Nothing on this plate.</h2><p>Try a different search or category.</p></div>}
      {itemCount > 0 && (
        <div className="floating-cart">
          <div>
            <span className="cart-count">{itemCount}</span>
            <span className="floating-cart-copy"><strong>Your order</strong><small>{itemCount} {itemCount === 1 ? 'item' : 'items'}</small></span>
          </div>
          <strong>{formatRupees(subtotal)}</strong>
          <Link className="button button-dark" to="/cart">See cart <ArrowIcon /></Link>
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

function CartPage({ cart, itemCount, subtotal, orderType, setCart, table, tableNotice, setQuantity, onMissingTable }) {
  const navigate = useNavigate();
  const items = Object.values(cart);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const dineInAttempt = useRef(newAttemptId());
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
    if (orderType === 'dine-in') {
      if (placing) return;
      setPlacing(true);
      setPlaceError('');
      api('/api/orders', {
        method: 'POST',
        body: {
          orderType,
          table,
          customerName: `Table ${table} guest`,
          checkoutAttemptId: dineInAttempt.current,
          items: items.map(({ id, name, price, quantity, image }) => ({ id, name, price, quantity, image })),
        },
      })
        .then((order) => {
          writeStorage('7sky-last-order', order.id);
          setCart({});
          sessionStorage.removeItem('7sky-checkout-started');
          sessionStorage.removeItem('7sky-checkout-attempt');
          navigate(`/confirmation/${encodeURIComponent(order.id)}`, { replace: true });
        })
        .catch((error) => {
          setPlaceError(error.message);
          setPlacing(false);
        });
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
      <EdgeDecorations />
      <div className="page-heading">
        <span className="eyebrow">YOUR GOOD THINGS</span>
        <h1>Your order<span>.</span></h1>
        <HeadingAccent />
        {orderType && <p>Made for <strong>{orderType === 'dine-in' ? `Table ${table || 'QR required'}` : orderType}</strong> · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>}
      </div>
      {!items.length ? (
        <div className="empty-cart">
          <PlateIcon />
          <h2>Your order is empty.</h2>
          <p>Explore the menu and add a dish to get started.</p>
          <Link className="button button-dark" to="/menu">Back to the menu <ArrowIcon /></Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-items" aria-label="Cart items">
            {items.map((item) => (
              <article className="cart-row" key={item.id}>
                <FoodImage src={item.image} alt={`Food photograph of ${item.name}`} className="cart-thumb" />
                <div className="cart-item-name"><h2>{item.name}</h2><span>{formatRupees(item.price)} each</span><button className="text-button remove-button" onClick={() => setQuantity(item, 0)}>Remove</button></div>
                <QuantityControl quantity={item.quantity} onChange={(quantity) => setQuantity(item, quantity)} label={`${item.name} quantity`} />
                <strong className="line-total">{formatRupees(item.price * item.quantity)}</strong>
              </article>
            ))}
            <Link to="/menu" className="continue-link"><ArrowIcon direction="left" />Keep browsing</Link>
          </section>
          <aside className="order-summary">
            <span className="eyebrow">A LITTLE RECAP</span>
            <h2>Order summary</h2>
            <div className="summary-line"><span>Subtotal · {itemCount} items</span><strong>{formatRupees(subtotal)}</strong></div>
            <div className="summary-line"><span>Taxes &amp; fees</span><span>Calculated at the restaurant</span></div>
            <div className="summary-total"><span>Total</span><strong>{formatRupees(subtotal)}</strong></div>
            <p className="summary-note">Taxes and service charges are not included.</p>
            {tableNotice && <p className="table-notice" role="status">{tableNotice}</p>}
            {orderType === 'dine-in' && !table && <p className="table-notice">Scan your table QR before placing a dine-in order.</p>}
            {placeError && <p className="table-notice" role="alert">{placeError}</p>}
            <button className="button button-dark full-button" onClick={proceed} disabled={placing}>{orderType === 'dine-in' ? (placing ? 'Placing order…' : 'Place Order') : 'Continue to payment'} <ArrowIcon /></button>
          </aside>
        </div>
      )}
    </main>
  );
}

function CheckoutPage({ cart, subtotal, orderType, setCart }) {
  const navigate = useNavigate();
  const started = sessionStorage.getItem('7sky-checkout-started') === 'yes';
  const [details, setDetails] = useState({ name: '', phone: '', address: '', instructions: '' });
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [paymentDetails, setPaymentDetails] = useState({ cardholder: '', cardNumber: '', expiry: '', cvv: '', upiId: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const items = Object.values(cart);
  useEffect(() => {
    if (!submissionLock.current && (!started || !items.length || !['takeaway', 'delivery'].includes(orderType))) navigate('/cart', { replace: true });
  }, [started, items.length, orderType, navigate]);

  const update = (key, value) => {
    setDetails((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };
  const updatePaymentDetail = (key, value) => {
    setPaymentDetails((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };
  const updateCardNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    updatePaymentDetail('cardNumber', digits.match(/.{1,4}/g)?.join(' ') || '');
  };
  const updateExpiry = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    updatePaymentDetail('expiry', digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  };
  const placeOrder = (event) => {
    event.preventDefault();
    if (submissionLock.current) return;
    const nextErrors = {};
    if (!details.name.trim()) nextErrors.name = 'Please enter your name.';
    const phoneDigits = details.phone;
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) nextErrors.phone = 'Enter a valid Indian mobile number: 10 digits starting with 6–9.';
    if (orderType === 'delivery' && !details.address.trim()) nextErrors.address = 'Please enter a delivery address.';
    if (paymentMethod === 'card') {
      if (!paymentDetails.cardholder.trim()) nextErrors.cardholder = 'Enter the name on the card.';
      if (paymentDetails.cardNumber.replace(/\D/g, '').length !== 16) nextErrors.cardNumber = 'Enter a 16-digit card number.';
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(paymentDetails.expiry)) nextErrors.expiry = 'Enter expiry as MM/YY.';
      if (!/^\d{3,4}$/.test(paymentDetails.cvv)) nextErrors.cvv = 'Enter a 3- or 4-digit security code.';
    }
    if (paymentMethod === 'upi' && !/^[\w.-]+@[\w.-]+$/.test(paymentDetails.upiId.trim())) {
      nextErrors.upiId = 'Enter a valid UPI ID, such as name@bank.';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    const attemptId = sessionStorage.getItem('7sky-checkout-attempt') || newAttemptId();
    sessionStorage.setItem('7sky-checkout-attempt', attemptId);
    api('/api/orders', {
      method: 'POST',
      body: {
        orderType,
        customerName: details.name.trim(),
        phone: phoneDigits,
        deliveryAddress: orderType === 'delivery' ? details.address.trim() : '',
        instructions: details.instructions.trim(),
        checkoutAttemptId: attemptId,
        paymentMethod,
        items: items.map(({ id, name, price, quantity, image }) => ({ id, name, price, quantity, image })),
      },
    })
      .then((order) => {
        writeStorage('7sky-last-order', order.id);
        setCart({});
        sessionStorage.removeItem('7sky-checkout-started');
        sessionStorage.removeItem('7sky-checkout-attempt');
        navigate(`/confirmation/${encodeURIComponent(order.id)}`, { replace: true });
      })
      .catch((error) => {
        submissionLock.current = false;
        setSubmitting(false);
        setErrors({ form: error.message });
      });
  };
  if (!started || !items.length || !['takeaway', 'delivery'].includes(orderType)) return null;

  return (
    <main className="page-shell checkout-page">
      <div className="page-heading">
        <span className="eyebrow">CHECKOUT · ORDER PLACEMENT</span>
        <h1>Complete your <em>order.</em></h1>
        <HeadingAccent />
        <p>Review your details before placing your order.</p>
      </div>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={placeOrder} noValidate>
          <section className="checkout-section checkout-customer-section">
          <div className="checkout-section-heading"><span className="eyebrow">01 · CUSTOMER DETAILS</span><h2>Who is this order for?</h2></div>
          <div className="checkout-order-context">
            <div><span>Order type</span><strong>{orderTypeLabel(orderType)}</strong></div>
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
          <label className="form-field">A note for the kitchen <span className="optional">(optional)</span>
            <textarea rows="3" maxLength="300" value={details.instructions} onChange={(event) => update('instructions', event.target.value)} placeholder="Allergies or anything we should know" />
          </label>
          </section>
          <section className="checkout-section checkout-payment-section">
          <div className="checkout-section-heading"><span className="eyebrow">02 · PAYMENT</span><h2>Choose a payment method</h2></div>
          <div className="payment-method-options" role="radiogroup" aria-label="Payment method">
            {[
              ['card', 'Credit / Debit Card'],
              ['upi', 'UPI'],
              ['qr', 'Scan QR'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`payment-method-card${paymentMethod === value ? ' active' : ''}`}
                type="button"
                role="radio"
                aria-checked={paymentMethod === value}
                aria-label={label}
                data-payment-method={value}
                tabIndex={paymentMethod === value ? 0 : -1}
                onClick={() => {
                  setPaymentMethod(value);
                  setErrors({});
                }}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  const methods = ['card', 'upi', 'qr'];
                  const currentIndex = methods.indexOf(value);
                  const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
                  const nextMethod = methods[(currentIndex + offset + methods.length) % methods.length];
                  setPaymentMethod(nextMethod);
                  setErrors({});
                  event.currentTarget.parentElement?.querySelector(`[data-payment-method="${nextMethod}"]`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {paymentMethod === 'card' && (
            <div className="payment-fields">
              <label className="form-field">Cardholder name
                <input autoComplete="cc-name" value={paymentDetails.cardholder} onChange={(event) => updatePaymentDetail('cardholder', event.target.value)} />
                {errors.cardholder && <span className="field-error" role="alert">{errors.cardholder}</span>}
              </label>
              <label className="form-field">Card number
                <input inputMode="numeric" autoComplete="cc-number" maxLength={19} value={paymentDetails.cardNumber} onChange={(event) => updateCardNumber(event.target.value)} placeholder="0000 0000 0000 0000" />
                {errors.cardNumber && <span className="field-error" role="alert">{errors.cardNumber}</span>}
              </label>
              <div className="payment-field-row">
                <label className="form-field">Expiry
                  <input inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={paymentDetails.expiry} onChange={(event) => updateExpiry(event.target.value)} placeholder="MM/YY" />
                  {errors.expiry && <span className="field-error" role="alert">{errors.expiry}</span>}
                </label>
                <label className="form-field">CVV
                  <input type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={paymentDetails.cvv} onChange={(event) => updatePaymentDetail('cvv', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="CVV" />
                  {errors.cvv && <span className="field-error" role="alert">{errors.cvv}</span>}
                </label>
              </div>
            </div>
          )}
          {paymentMethod === 'upi' && (
            <div className="payment-fields">
              <label className="form-field">UPI ID
                <input autoComplete="off" value={paymentDetails.upiId} onChange={(event) => updatePaymentDetail('upiId', event.target.value.trim())} placeholder="name@bank" />
                {errors.upiId && <span className="field-error" role="alert">{errors.upiId}</span>}
              </label>
              <div className="upi-app-labels" aria-label="Available UPI apps"><span>Google Pay</span><span>PhonePe</span><span>Paytm</span></div>
            </div>
          )}
          {paymentMethod === 'qr' && (
            <div className="qr-payment-panel">
              <svg className="payment-qr-graphic" viewBox="0 0 29 29" role="img" aria-label="QR-code-style payment graphic" shapeRendering="crispEdges">
                <rect width="29" height="29" rx="1" fill="#fffdf8" />
                <path fill="#17130f" d="M2 2h7v7H2zm2 2v3h3V4zm16-2h7v7h-7zm2 2v3h3V4zM2 20h7v7H2zm2 2v3h3v-3zM12 2h2v2h-2zm3 0h2v4h-2zm-3 4h3v2h-3zm2 3h3v2h-3zm4 0h2v3h-2zm3 1h2v3h-2zm3-1h2v2h-2zM11 12h2v2h-2zm3 1h2v3h-2zm4 0h2v2h-2zm-7 3h3v2h-3zm5 1h2v3h-2zm3-2h3v2h-3zm4 1h2v3h-2zm-12 4h2v3h-2zm4 1h2v2h-2zm3 2h3v2h-3zm4-1h2v4h-2zm4-2h2v2h-2zm-13 5h2v1h-2zm5-1h2v2h-2z" />
              </svg>
              <div><strong>{formatRupees(subtotal)}</strong><span>Scan with any UPI app</span></div>
            </div>
          )}
          {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
          <button className="button button-pay full-button" type="submit" disabled={submitting}>{submitting ? 'Completing payment…' : `Pay ${formatRupees(subtotal)}`}</button>
          </section>
        </form>
        <aside className="order-summary checkout-summary">
          <span className="eyebrow">ORDER REVIEW</span><h2>Your order</h2>
          {items.map((item) => <div className="summary-line" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{formatRupees(item.quantity * item.price)}</strong></div>)}
          <div className="summary-line"><span>Order type</span><strong>{orderTypeLabel(orderType)}</strong></div>
          <div className="summary-total"><span>Order total</span><strong>{formatRupees(subtotal)}</strong></div>
          <div className="payment-status-note"><span className="payment-status-dot" />Status updates to Paid when you pay</div>
        </aside>
      </div>
    </main>
  );
}

function OrderStatusPage({ mode }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setLoading(true);
    setNotFound(false);
    const load = async () => {
      try {
        const data = await api(`/api/orders/${encodeURIComponent(orderId)}`);
        if (cancelled) return;
        setOrder(data);
        setConnectionError('');
        setLoading(false);
        if (data.status === 'Completed') return;
      } catch (error) {
        if (cancelled) return;
        setLoading(false);
        if (error.status === 404) {
          setNotFound(true);
          return;
        }
        setConnectionError(error.message);
      }
      timer = window.setTimeout(load, 4000);
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);

  if (loading) return <main className="page-shell"><div className="empty-cart"><h2>Loading your order…</h2></div></main>;
  if (notFound || !order) return <main className="page-shell"><div className="empty-cart"><h2>We couldn’t find that order.</h2><p>Check the order number and try again.</p><Link className="button button-dark" to="/track">Track an order</Link></div></main>;
  const flow = statusFlowFor(order.orderType);
  const currentIndex = flow.indexOf(order.status);
  return (
    <main className="page-shell confirmation-page">
      <div className="confirmation-card">
        <div className="confirmation-success-icon"><OrderBurst /><CheckIcon /></div>
        <span className="eyebrow">{mode === 'confirmation' ? 'ORDER PLACED' : 'ORDER STATUS'}</span>
        <h1>{mode === 'confirmation' ? <>Your order is <em>placed.</em></> : <>Your order <em>status.</em></>}</h1>
        <HeadingAccent />
        <p className="confirmation-subtitle">This page updates by itself while the kitchen works on your order.</p>
        <div className="confirmation-number"><span>ORDER NUMBER</span><strong>{order.orderNumber}</strong></div>
        <div className="live-status" role="status" aria-live="polite">
          <span>CURRENT STATUS</span>
          <strong>{customerStatusLabels[order.status] || order.status}</strong>
        </div>
        <ol className="status-track" aria-label="Order progress">
          {flow.map((step, index) => (
            <li key={step} className={`status-step${index < currentIndex ? ' is-done' : ''}${index === currentIndex ? ' is-current' : ''}`}>
              <span className="status-step-dot" aria-hidden="true" />
              <span className="status-step-label">{customerStatusLabels[step] || step}</span>
            </li>
          ))}
        </ol>
        <div className="confirmation-details">
          <div><span>Order type</span><strong>{orderTypeLabel(order.orderType)}{order.table ? ` · Table ${order.table}` : ''}</strong></div>
          <div><span>Payment method</span><strong>{paymentMethodLabel(order.paymentMethod, order.orderType)}</strong></div>
          <div><span>Payment status</span><strong>{order.paymentStatus}</strong></div>
          <div><span>Customer</span><strong>{order.customerName || 'Guest'}</strong></div>
        </div>
        <div className="confirmation-items">{order.items.map((item) => <p key={item.id}>{item.quantity} × {item.name}<span>{formatRupees(item.price * item.quantity)}</span></p>)}</div>
        <div className="confirmation-total"><span>Order total</span><strong>{formatRupees(order.subtotal)}</strong></div>
        {connectionError && <p className="device-order-note" role="status">Reconnecting… {connectionError}</p>}
        <Link to="/" className="button button-dark">Return to homepage <ArrowIcon /></Link>
      </div>
    </main>
  );
}

function TrackLookupPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState(() => readStorage('7sky-last-order', ''));
  const submit = (event) => {
    event.preventDefault();
    const id = value.trim().toUpperCase();
    if (id) navigate(`/order/${encodeURIComponent(id)}`);
  };
  return (
    <main className="page-shell confirmation-page">
      <div className="confirmation-card">
        <span className="eyebrow">TRACK YOUR ORDER</span>
        <h1>Where is my <em>order?</em></h1>
        <HeadingAccent />
        <p className="confirmation-subtitle">Enter the order number from your confirmation page.</p>
        <form onSubmit={submit} noValidate>
          <label className="form-field">Order number<input value={value} onChange={(event) => setValue(event.target.value)} placeholder="7S-261107-ABC123" autoComplete="off" /></label>
          <button className="button button-dark full-button" disabled={!value.trim()}>Track order <ArrowIcon /></button>
        </form>
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
  const portalName = role === 'owner' ? 'Owner portal' : 'The Kitchen portal';
  const portalTitle = role === 'owner' ? 'A clearer view of your restaurant.' : 'Service starts in The Kitchen.';
  const portalDescription = role === 'owner'
    ? 'Review orders, manage the menu and prepare your tables from one considered workspace.'
    : 'Keep new orders moving, coordinate preparation and make every service feel seamless.';
  useEffect(() => {
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (!validRole) return <Navigate to="/" replace />;
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const session = await api('/api/login', { method: 'POST', body: { username: username.trim(), password, role } });
      setUser({ username: session.username, role: session.role, token: session.token });
      navigate(role === 'owner' ? '/owner' : '/kitchen', { replace: true });
    } catch (loginError) {
      setError(loginError.message);
      setBusy(false);
    }
  };
  return (
    <main className={`page-shell login-page login-page-${role}`}>
      <div className="login-portal">
        <aside className="login-brand-panel">
          <img className="login-wordmark" src={brandLogo} alt="7th Sky" />
          <span className="eyebrow">{portalName}</span>
          <h1>{portalTitle}</h1>
          <p>{portalDescription}</p>
          <div className="login-portal-note"><span className="login-portal-dot" />{role === 'owner' ? 'Restaurant management' : 'Service operations'}</div>
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
          <button className="button button-dark full-button" disabled={busy}>{busy ? 'Checking…' : `Enter ${role} portal`} <ArrowIcon /></button>
        </form>
        <div className="credential-hint"><strong>Restaurant team access</strong><span>Contact your administrator for account details.</span></div>
        {notice && <span role="status">{notice}</span>}
        </section>
      </div>
    </main>
  );
}

function KitchenPage({ orders, setOrders, token, error }) {
  const [filter, setFilter] = useState('All');
  const [actionError, setActionError] = useState('');
  const filtered = orders.filter((order) => filter === 'All' || (filter === 'Active' ? order.status !== 'Completed' : order.status === 'Completed'));
  const updateStatus = async (id, status) => {
    const previousStatus = orders.find((order) => order.id === id)?.status;
    setActionError('');
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    try {
      const updated = await api(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', token, body: { status } });
      setOrders((current) => current.map((order) => order.id === id ? updated : order));
    } catch (updateError) {
      setOrders((current) => current.map((order) => order.id === id && previousStatus ? { ...order, status: previousStatus } : order));
      setActionError(updateError.message);
    }
  };
  const activeOrders = orders.filter((order) => order.status !== 'Completed');
  const newOrders = orders.filter((order) => order.status === 'Placed');
  const preparingOrders = orders.filter((order) => order.status === 'Preparing');
  const readyOrders = orders.filter((order) => order.status === 'Ready');
  return (
    <main className="page-shell dashboard-page kitchen-page">
      <div className="dashboard-heading">
        <div><span className="eyebrow">SERVICE OVERVIEW</span><h1>The <em>Kitchen.</em></h1><p>Live orders from every device.</p></div>
        <span className="device-pill">LIVE</span>
      </div>
      <section className="kitchen-stats" aria-label="Order status summary">
        <div className="kitchen-stat kitchen-stat-new"><span>Needs attention</span><strong>{newOrders.length}</strong><small>Placed orders</small></div>
        <div className="kitchen-stat"><span>In preparation</span><strong>{preparingOrders.length}</strong><small>Being prepared</small></div>
        <div className="kitchen-stat"><span>Ready to serve</span><strong>{readyOrders.length}</strong><small>Awaiting collection</small></div>
        <div className="kitchen-stat"><span>Active orders</span><strong>{activeOrders.length}</strong><small>Not yet completed</small></div>
      </section>
      <div className="dashboard-toolbar kitchen-toolbar">
        <div className="tabs" role="tablist" aria-label="Filter kitchen orders">
          {['All', 'Active', 'Completed'].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'All' ? 'All orders' : item}</button>)}
        </div>
        <span>{filtered.length} {filtered.length === 1 ? 'order' : 'orders'}</span>
      </div>
      {(actionError || error) && <p className="form-error" role="alert">{actionError || error}</p>}
      <OrdersTable orders={filtered} onStatusChange={updateStatus} />
    </main>
  );
}

function OrdersTable({ orders, onStatusChange }) {
  const sortedOrders = [...orders].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  if (!sortedOrders.length) return <div className="dashboard-empty"><SparkleIcon className="dashboard-empty-mark" /><h2>No orders yet</h2></div>;
  return (
    <div className="order-table-card table-scroll">
      <table className="orders-table">
        <thead><tr><th>Order No.</th><th>Items</th><th>Order Type</th><th>Payment Status</th><th>{onStatusChange ? 'Update Status' : 'Status'}</th></tr></thead>
        <tbody>{sortedOrders.map((order) => (
          <tr key={order.id}>
            <td><strong>{order.orderNumber}</strong></td>
            <td>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</td>
            <td>{orderTypeLabel(order.orderType)}{order.orderType === 'dine-in' && order.table ? ` · Table ${order.table}` : ''}</td>
            <td><span className={`payment-chip payment-${String(order.paymentStatus).toLowerCase().replaceAll(' ', '-')}`}>{order.paymentStatus}</span></td>
            <td>{onStatusChange
              ? <select aria-label={`Status for order ${order.orderNumber}`} className={`order-status-select ${statusClass(order.status)}`} value={order.status} onChange={(event) => onStatusChange(order.id, event.target.value)}>{statusFlowFor(order.orderType).map((status) => <option key={status}>{status}</option>)}</select>
              : <span className={`status-chip ${statusClass(order.status)}`}>{order.status}</span>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function OwnerPage({ orders, error, menu, setMenu, categories, tableCount, setTableCount }) {
  const [tab, setTab] = useState('Overview');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All time');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', category: categories[0] || '', price: '', image: '', available: true, tag: '' });
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString());
  const paidOrders = orders.filter((order) => order.paymentStatus === 'Paid');
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
    if (window.confirm('Remove this dish from the menu?')) setMenu((current) => current.filter((dish) => dish.id !== id));
  };
  const toggleDish = (id) => setMenu((current) => current.map((dish) => dish.id === id ? { ...dish, available: !dish.available } : dish));
  return (
    <main className="page-shell dashboard-page owner-page">
      <div className="dashboard-heading"><div><span className="eyebrow">7TH SKY · OWNER PORTAL</span><h1>Restaurant <em>overview.</em></h1><p>Orders, menu and table setup.</p></div><span className="device-pill">LIVE</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="tabs owner-tabs" role="tablist">
        {['Overview', 'Orders', 'Menu', 'Tables & QR'].map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === 'Overview' && <>
        <div className="stats-grid">
          <StatCard label="All orders" value={orders.length} note="Orders placed" />
          <StatCard label="Today’s orders" value={todayOrders.length} note="Since midnight" />
          <StatCard label="Revenue" value={formatRupees(paidOrders.reduce((total, order) => total + order.subtotal, 0))} note={`${paidOrders.length} paid ${paidOrders.length === 1 ? 'order' : 'orders'}`} />
          <StatCard label="In the kitchen" value={orders.filter((order) => ['Placed', 'Preparing'].includes(order.status)).length} note="Placed or being prepared" />
        </div>
        <section className="owner-charts" aria-label="Order charts">
          <OrdersPerDayChart orders={orders} />
          <PeakHoursChart orders={orders} />
        </section>
        <section className="owner-overview-grid">
          <div className="owner-panel owner-recent-orders"><span className="eyebrow">RECENT ORDERS</span><h2>On the books</h2><OrdersTable orders={orders.slice(0, 5)} /></div>
          <div className="owner-panel"><span className="eyebrow">MOST ORDERED</span><h2>People love</h2>{popular.length ? popular.map(([name, count], index) => <div className="popular-row" key={name}><span>0{index + 1}</span><strong>{name}</strong><span>{count} {count === 1 ? 'order' : 'orders'}</span></div>) : <p className="muted-copy">Popular dishes will appear after the first order.</p>}</div>
        </section>
      </>}
      {tab === 'Orders' && <section className="owner-panel order-table-panel"><div className="panel-title-row"><div><span className="eyebrow">ORDER HISTORY</span><h2>Every good thing, logged.</h2></div><div className="filter-group"><label className="filter-select">Date <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>{['All time', 'Today', 'Last 7 days'].map((date) => <option key={date}>{date}</option>)}</select></label><label className="filter-select">Status <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All', ...allStatuses].map((status) => <option key={status}>{status}</option>)}</select></label></div></div>
        <OrdersTable orders={filteredOrders} />
      </section>}
      {tab === 'Menu' && <section className="owner-panel owner-menu-panel"><div className="panel-title-row"><div><span className="eyebrow">OUR MENU</span><h2>Keep the good things coming.</h2></div><button className="button button-dark" onClick={openNew}>Add dish <span>+</span></button></div>
        <div className="category-management"><span className="eyebrow">MENU CATEGORIES</span><div className="category-chips">{categories.map((category) => <span key={category}>{category}</span>)}</div></div>
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
        <p className="device-order-note">Table QR codes use this site’s current address. Confirm it before printing the codes.</p>
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

function niceMax(value) {
  const raw = Math.max(value, 1) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  return step * 4;
}

function BarChart({ data, summary, labelEvery = 1, highlightMax = false }) {
  const width = 640;
  const height = 300;
  const margin = { top: 18, right: 12, bottom: 40, left: 46 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const peak = Math.max(0, ...data.map((item) => item.value));
  const max = niceMax(peak);
  const ticks = [0, 1, 2, 3, 4].map((index) => Math.round((max / 4) * index * 100) / 100);
  const band = innerWidth / data.length;
  const barWidth = Math.max(4, Math.min(34, band * 0.68));
  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
      {ticks.map((tick) => {
        const y = margin.top + innerHeight - (tick / max) * innerHeight;
        return (
          <g key={tick}>
            <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={y} y2={y} />
            <text className="chart-axis" x={margin.left - 8} y={y + 5} textAnchor="end">{Number.isInteger(tick) ? tick : tick.toFixed(1)}</text>
          </g>
        );
      })}
      {data.map((item, index) => {
        const barHeight = (item.value / max) * innerHeight;
        const x = margin.left + index * band + (band - barWidth) / 2;
        const y = margin.top + innerHeight - barHeight;
        const isPeak = highlightMax && peak > 0 && item.value === peak;
        return (
          <g key={item.key}>
            <rect className={`chart-bar${isPeak ? ' is-peak' : ''}`} x={x} y={y} width={barWidth} height={Math.max(barHeight, item.value ? 2 : 0)} rx="3">
              <title>{`${item.tooltip}: ${item.value} ${item.value === 1 ? 'order' : 'orders'}`}</title>
            </rect>
            {index % labelEvery === 0 && <text className="chart-axis" x={x + barWidth / 2} y={height - 13} textAnchor="middle">{item.label}</text>}
          </g>
        );
      })}
      <line className="chart-baseline" x1={margin.left} x2={width - margin.right} y1={margin.top + innerHeight} y2={margin.top + innerHeight} />
    </svg>
  );
}

function RangeToggle({ options, value, onChange, label }) {
  return (
    <div className="chart-toggle" role="group" aria-label={label}>
      {options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  );
}

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

function OrdersPerDayChart({ orders }) {
  const [days, setDays] = useState(7);
  const { data, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: days }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (days - 1 - index));
      return {
        key: dayKey(date),
        value: 0,
        label: days === 7 ? date.toLocaleDateString('en-IN', { weekday: 'short' }) : `${date.getDate()}/${date.getMonth() + 1}`,
        tooltip: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      };
    });
    const lookup = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    let count = 0;
    orders.forEach((order) => {
      const bucket = lookup.get(dayKey(new Date(order.createdAt)));
      if (bucket) {
        bucket.value += 1;
        count += 1;
      }
    });
    return { data: buckets, total: count };
  }, [orders, days]);
  const busiest = data.reduce((best, item) => (item.value > best.value ? item : best), { value: 0 });
  const summary = `Orders per day over the last ${days} days. ${total} orders in total.`;
  return (
    <article className="owner-panel chart-card">
      <div className="chart-heading">
        <div><span className="eyebrow">ORDERS OVER TIME</span><h2>Orders per day</h2></div>
        <RangeToggle label="Choose date range" value={days} onChange={setDays} options={[{ value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }]} />
      </div>
      <BarChart data={data} summary={summary} labelEvery={days === 7 ? 1 : 5} />
      <p className="chart-summary">
        <strong>{total}</strong> {total === 1 ? 'order' : 'orders'} in the last {days} days
        {total > 0 && <> · average <strong>{(total / days).toFixed(1)}</strong> a day · busiest day <strong>{busiest.tooltip}</strong> ({busiest.value})</>}
        {total === 0 && <> · no orders in this period yet</>}
      </p>
    </article>
  );
}

const hourLabel = (hour) => `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;

function PeakHoursChart({ orders }) {
  const [range, setRange] = useState(30);
  const { data, total } = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      key: hour,
      value: 0,
      label: hourLabel(hour),
      tooltip: `${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}`,
    }));
    const cutoff = range === 0 ? 0 : Date.now() - range * 24 * 60 * 60 * 1000;
    let count = 0;
    orders.forEach((order) => {
      const created = new Date(order.createdAt);
      if (created.getTime() >= cutoff) {
        buckets[created.getHours()].value += 1;
        count += 1;
      }
    });
    return { data: buckets, total: count };
  }, [orders, range]);
  const peakValue = Math.max(0, ...data.map((item) => item.value));
  const peakHours = data.filter((item) => peakValue > 0 && item.value === peakValue);
  const rangeText = range === 0 ? 'all time' : `the last ${range} days`;
  const summary = peakHours.length
    ? `Orders by hour of the day for ${rangeText}. Peak hour: ${peakHours.map((item) => item.tooltip).join(', ')}.`
    : `Orders by hour of the day for ${rangeText}. No orders yet.`;
  return (
    <article className="owner-panel chart-card">
      <div className="chart-heading">
        <div><span className="eyebrow">PEAK HOURS</span><h2>Orders by time of day</h2></div>
        <RangeToggle label="Choose date range" value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 0, label: 'All time' }]} />
      </div>
      <BarChart data={data} summary={summary} labelEvery={3} highlightMax />
      <p className="chart-summary">
        {peakHours.length > 0
          ? <>Peak time: <strong>{peakHours.map((item) => item.tooltip).join(' and ')}</strong> with <strong>{peakValue}</strong> {peakValue === 1 ? 'order' : 'orders'} · {total} orders in {rangeText}</>
          : <>No orders in {rangeText} yet. Peak hours will appear here after the first orders.</>}
      </p>
    </article>
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
          {variant === 'home' ? <><Link to="/#signature">The menu <ArrowIcon /></Link><Link to="/#order">How to order <ArrowIcon /></Link></> : <><Link to="/menu">Menu <ArrowIcon /></Link><Link to="/cart">Your cart <ArrowIcon /></Link></>}
        </div>
      </div>
      <div className="footer-bottom"><span>Copyright 2026 7th Sky</span><span>Live order tracking from any device</span></div>
    </footer>
  );
}

export default App;