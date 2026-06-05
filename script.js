const cursor=document.querySelector('.cursor');
document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});
document.querySelectorAll('a,article').forEach(el=>{
  el.addEventListener('mouseenter',()=>{cursor.style.width='36px';cursor.style.height='36px';cursor.style.opacity='.45'});
  el.addEventListener('mouseleave',()=>{cursor.style.width='12px';cursor.style.height='12px';cursor.style.opacity='1'});
});
const moon=document.querySelector('.moon-inner');
window.addEventListener('scroll',()=>{moon.style.transform=`translateY(${scrollY*.08}px) rotate(${scrollY*.02}deg)`});
const filters=document.querySelectorAll('.work-filters button');
const cards=document.querySelectorAll('.work-card');
filters.forEach(button=>button.addEventListener('click',()=>{
  filters.forEach(item=>item.classList.remove('active'));
  button.classList.add('active');
  cards.forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter));
}));
const lightbox=document.querySelector('.lightbox');
cards.forEach(card=>card.addEventListener('click',()=>{
  lightbox.querySelector('img').src=card.querySelector('img').src;
  lightbox.querySelector('img').alt=card.querySelector('img').alt;
  lightbox.querySelector('p').textContent=card.querySelector('figcaption').innerText.replace(/\n/g,' · ');
  lightbox.showModal();
}));
lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close()});
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
