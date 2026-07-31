//https://iplt20-dev-v2.epicon.in/players/ruturaj-gaikwad/5443
debut = document.querySelectorAll('.grid-container .grid-items')[0].querySelector('p').innerText;
matches = document.querySelectorAll('.grid-container .grid-items')[3].querySelector('p').innerText;
matces = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[1].innerText;
runs = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[3].innerText;
highst = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[4].innerText;
catces = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[12].innerText;
wkts = document.querySelectorAll('table')[1].querySelectorAll('tr')[1].children[4].innerText;
console.log("debut, matches, runs, wkts, catces, highst");
console.log(debut, matches, runs, wkts, catces, highst);
arr.push([debut, matches, runs, wkts, catces, highst]);


// Extract data
nm = document.querySelector(".plyr-name-nationality h1").innerText;
dbut = document.querySelectorAll('.grid-container .grid-items')[0].querySelector('p').innerText.trim();
mtches = document.querySelectorAll('.grid-container .grid-items')[3].querySelector('p').innerText.trim();
rns = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[3].innerText.trim();
hghst = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[4].innerText.trim();
ctchs = document.querySelectorAll('table')[0].querySelectorAll('tr')[1].children[12].innerText.trim();
wkts = document.querySelectorAll('table')[1].querySelectorAll('tr')[1].children[4].innerText.trim();

 plyr = {
    nm,
    dbut,
    mtches,
    rns,
    hghst,
    ctchs,
    wkts
};

plyrs = JSON.parse(localStorage.getItem("iplPlayers") || "[]");
plyrs.push(plyr);
localStorage.setItem("iplPlayers", JSON.stringify(plyrs));
console.log(plyrs);