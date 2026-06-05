const cursor=document.querySelector('.cursor');
document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
const moon=document.querySelector('.moon-inner');
window.addEventListener('scroll',()=>{moon.style.transform=`translateY(${scrollY*.08}px) rotate(${scrollY*.02}deg)`});

const labels={nightscape:'星野',deepsky:'深空',planetary:'行星'};
const track=document.querySelector('.work-track');
const filters=document.querySelectorAll('.work-filters [data-filter]');
const currentEl=document.querySelector('.gallery-current');
const totalEl=document.querySelector('.gallery-total');
const lightbox=document.querySelector('.lightbox');
let visibleWorks=[...window.galleryData];
let currentIndex=0;

function renderGallery(filter='all'){
  visibleWorks=filter==='all'?[...window.galleryData]:window.galleryData.filter(work=>work.category===filter);
  currentIndex=0;
  track.innerHTML=visibleWorks.map((work,index)=>`<figure class="work-card" data-index="${index}"><img src="${work.src}" alt="${work.title}" loading="${index<2?'eager':'lazy'}"><figcaption><b>${work.title}</b><span>${labels[work.category]} · ${String(index+1).padStart(2,'0')}</span></figcaption></figure>`).join('');
  totalEl.textContent=String(visibleWorks.length).padStart(2,'0');
  currentEl.textContent='01';
  track.scrollLeft=0;
}
function cards(){return [...track.querySelectorAll('.work-card')]}
function goTo(index){
  const items=cards();
  currentIndex=(index+items.length)%items.length;
  items[currentIndex]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  currentEl.textContent=String(currentIndex+1).padStart(2,'0');
}
filters.forEach(button=>button.addEventListener('click',()=>{
  filters.forEach(item=>item.classList.remove('active'));
  button.classList.add('active');
  renderGallery(button.dataset.filter);
}));
document.querySelector('.gallery-prev').addEventListener('click',()=>goTo(currentIndex-1));
document.querySelector('.gallery-next').addEventListener('click',()=>goTo(currentIndex+1));
track.addEventListener('scroll',()=>{
  window.clearTimeout(track.scrollTimer);
  track.scrollTimer=window.setTimeout(()=>{
    const center=track.scrollLeft+track.clientWidth/2;
    const items=cards();
    let nearest=0,distance=Infinity;
    items.forEach((item,index)=>{const d=Math.abs(item.offsetLeft+item.offsetWidth/2-center);if(d<distance){distance=d;nearest=index}});
    currentIndex=nearest;
    currentEl.textContent=String(currentIndex+1).padStart(2,'0');
  },80);
});
let dragStart=0,scrollStart=0,dragged=false;
track.addEventListener('pointerdown',event=>{dragStart=event.clientX;scrollStart=track.scrollLeft;dragged=false;track.classList.add('is-dragging');track.setPointerCapture(event.pointerId)});
track.addEventListener('pointermove',event=>{if(!track.classList.contains('is-dragging'))return;const delta=event.clientX-dragStart;if(Math.abs(delta)>5)dragged=true;track.scrollLeft=scrollStart-delta});
track.addEventListener('pointerup',()=>track.classList.remove('is-dragging'));
track.addEventListener('click',event=>{
  const card=event.target.closest('.work-card');
  if(!card||dragged)return;
  const work=visibleWorks[Number(card.dataset.index)];
  lightbox.querySelector('img').src=work.src;
  lightbox.querySelector('img').alt=work.title;
  lightbox.querySelector('p').textContent=`${work.title} · ${labels[work.category]}`;
  lightbox.showModal();
});
document.addEventListener('keydown',event=>{if(lightbox.open)return;if(event.key==='ArrowLeft')goTo(currentIndex-1);if(event.key==='ArrowRight')goTo(currentIndex+1)});
lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close()});
renderGallery();

document.querySelectorAll('a,button,.work-card').forEach(el=>{
  el.addEventListener('mouseenter',()=>{cursor.style.width='36px';cursor.style.height='36px';cursor.style.opacity='.45'});
  el.addEventListener('mouseleave',()=>{cursor.style.width='12px';cursor.style.height='12px';cursor.style.opacity='1'});
});

const journeyStops=document.querySelectorAll('.journey-stop');
const journeyViewer=document.querySelector('.journey-viewer');
journeyStops.forEach(stop=>stop.addEventListener('click',()=>{
  journeyStops.forEach(item=>item.classList.remove('active'));
  stop.classList.add('active');
  journeyViewer.classList.add('is-changing');
  window.setTimeout(()=>{
    const image=journeyViewer.querySelector('img');
    image.src=stop.dataset.image;
    image.alt=stop.dataset.title+'代表影像';
    journeyViewer.querySelector('span').textContent=stop.dataset.kicker;
    journeyViewer.querySelector('h2').textContent=stop.dataset.title;
    journeyViewer.querySelector('p').textContent=stop.dataset.copy;
    journeyViewer.classList.remove('is-changing');
  },220);
}));
