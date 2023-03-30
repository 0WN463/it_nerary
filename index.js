const fileInput = document.getElementById('file')
const dirPanel = document.getElementById('directionsPanel')
const timeline = document.getElementById('timeline')

document.getElementById('button').onclick = async () => {
    const t = await fileInput.files[0].text()
    const doc = jsyaml.load(t)
    initMap(doc)
}

const last = (arr) => arr[arr.length -1]

async function initMap(data) {
    const places = [data.start, ...data.itinerary.filter(e => e.place).map(e => e.place)]

    const travels = []
    let prevPlace = true

    data.itinerary.forEach(p => {
	if (p.place) {
	    if (prevPlace) {
		travels.push(undefined)
		return
	    }

	    prevPlace = true
	    return
	}

	travels.push(p.travel) 
	prevPlace = false
    })

    const directionsService = new google.maps.DirectionsService();
    const map = new google.maps.Map(document.getElementById("map"), {
	zoom: 12,
	center: data.start.loc,
    });

    const infoWindow = new google.maps.InfoWindow();

    const selectColor = number => {
	const hue = number * 137.508; // use golden angle approximation
	return `hsl(${hue},50%,75%)`;
    }
    const startTime = toDate(data.start.date, data.start.time, data.start.timeZone)
    let currTime = startTime

    const inc = (time, secs) => {
	const nextTime = new Date(time)
	nextTime.setSeconds(nextTime.getSeconds() + secs)
	return nextTime
    }

    const placeTimes = [{start: startTime, end: startTime}]
    const travelTimes = []
    for (let i = 0; i < places.length - 1; i++) {
	if (travels[i]) {
	    const duration = travels[i].duration * 60 
	    travelTimes.push({start: currTime, end: inc(currTime, duration)})
	    currTime = inc(currTime, duration)

	    const spentDur = (places[i+1].duration ?? 0) * 60
	    placeTimes.push({start: currTime, end: inc(currTime, spentDur)})
	    currTime = inc(currTime, spentDur)
	    continue
	}
	const res = await calcRoute(directionsService, places[i], places[i+1], currTime)
	if (!res) {
	    alert("Unable to find route")
	    return;
	}

	const directionsRenderer = new google.maps.DirectionsRenderer({
	    polylineOptions: {visible:false},
	    markerOptions: {visible: false},
	});

	// only 1 leg since no waypoints
	const points = res.routes[0].legs[0].steps.flatMap(s => s.lat_lngs)

	const routLine = new google.maps.Polyline(
	    {
		path: points,
		strokeColor: selectColor(i),
		strokeOpacity: 0.5,
		strokeWeight: 10    
	    }
	);
	routLine.setMap(map);
	google.maps.event.addListener(routLine, 'click', () => {
	    dirPanel.innerHTML = "" 
	    directionsRenderer.setPanel(dirPanel);
	});

	directionsRenderer.setMap(map);
	directionsRenderer.setDirections(res);

	const duration = res.routes[0].legs[0].duration.value 
	travelTimes.push({start: currTime, end: inc(currTime, duration)})
	currTime = inc(currTime, duration)

	const spentDur = (places[i+1].duration ?? 0) * 60
	placeTimes.push({start: currTime, end: inc(currTime, spentDur)})
	currTime = inc(currTime, spentDur)
    }


    const formatTime = t => t.toLocaleTimeString([], { 
	timeZone: data.ianaTimeZone,
	timeStyle: 'short',
	hour12: false,
    })

    places.forEach(({loc, name}, i) => {
	const pinColor = selectColor(i)

	const pinSVGFilled = "M 12,2 C 8.1340068,2 5,5.1340068 5,9 c 0,5.25 7,13 7,13 0,0 7,-7.75 7,-13 0,-3.8659932 -3.134007,-7 -7,-7 z";
	const labelOriginFilled =  new google.maps.Point(12,9);

	const markerImage = {  
	    path: pinSVGFilled,
	    anchor: new google.maps.Point(12,17),
	    fillOpacity: 1,
	    fillColor: pinColor,
	    strokeWeight: 2,
	    strokeColor: "white",
	    scale: 2,
	    labelOrigin: labelOriginFilled
	};


	const marker = new google.maps.Marker({
	    position: loc,
	    map,
	    title: `${i + 1}. ${name}`,
	    label: `${i + 1}`,
	    optimized: false,
	    icon: markerImage,
	});

	marker.addListener("click", () => {
	    infoWindow.close();
	    infoWindow.setContent(`<div>${marker.getTitle()}<div/><div>${formatTime(placeTimes[i].start)} - ${formatTime(placeTimes[i].end)}<div/>`);
	    infoWindow.open(marker.getMap(), marker);
	});
    });



    const totalTime = last(placeTimes).end - placeTimes[0].start
    timeline.innerHTML = ""

    placeTimes
	.forEach((t, i) => {
	    const timeblock  = document.querySelector("template").content.firstElementChild.cloneNode(true);
	    timeblock.querySelector(".start").innerHTML = formatTime(t.start)
	    if (places[i].duration > 0) {
		timeblock.querySelector(".end").innerHTML = formatTime(t.end)
		timeblock.querySelector(".event").style.transform = "translate(0, -50%)"
		timeblock.setAttribute('data-line', `${places[i].duration} mins`)
	    } 


	    const event = timeblock.querySelector(".event")
	    event.innerHTML = `${places[i].name} ${i+1}`
	    timeblock.style.height = `${(t.end - t.start) / totalTime * 100}%`
	    timeblock.style.top = `${(t.start - startTime) / totalTime * 100}%`

	    timeblock.style.background =  selectColor(i)
	    timeblock.style.zIndex = 1
	    if (places[i].events)
		timeblock.onmouseover = () => event.innerHTML = places[i].events
		    .map(e => `<div>${e}</div>`)
		    .join("\n")

	    timeblock.onmouseout = () => event.innerHTML = `${places[i].name} ${i+1}`

	    timeline.appendChild(timeblock);
	})


    travelTimes
	.forEach((t, i) => {
	    const timeblock  = document.querySelector("template").content.firstElementChild.cloneNode(true);
	    timeblock.setAttribute('data-line', `${Math.floor((t.end - t.start)/60000)} mins`)

	    timeblock.style.height = `${(t.end - t.start) / totalTime * 100}%`
	    timeblock.style.top = `${(t.start - startTime) / totalTime * 100}%`

	    timeblock.style.background =  travels[i] ? "grey" : "red"

	    timeblock.onclick = () => {
		const p = places[i]
		const p2 = places[i+1]
		const f = place => `${place.loc.lat}%2C${place.loc.lng}`

		window.open(`https://www.google.com/maps/dir/?api=1&origin=${f(p)}&destination=${f(p2)}&travelmode=transit`,'mywindow')
	    }

	    timeline.appendChild(timeblock);
	})


    document.getElementById('date').innerHTML = startTime.toLocaleDateString(
	'default', { 
	    weekday: "short",
	    year: "numeric",
	    month: "short",
	    day: "numeric",
	},
    ) + " " + data.ianaTimeZone


  const download_csv = (places, placeTimes, travelTimes) => {
	const headers = ["Subject", "Start Date", "Start Time", "End Time", "Description"]
	const placeRows = placeTimes.map((p, i) => ([
		places[i].name,
		p.start.toLocaleDateString({locale:"en-US"}),
		p.start.toLocaleTimeString("en-US", {timeZone: data.ianaTimeZone}),
		p.end.toLocaleTimeString("en-US", {timeZone: data.ianaTimeZone}),
		places[i].events?.join(';') ?? '',
	]))
	const travelRows = travelTimes.map((t, i) => {
		const p = places[i]
		const p2 = places[i+1]
		const f = place => `${place.loc.lat}%2C${place.loc.lng}`
		return [
			`Travel from ${p.name} to ${p2.name}`,
			t.start.toLocaleDateString({locale:"en-US"}),
			t.start.toLocaleTimeString("en-US", {timeZone: data.ianaTimeZone}),
			t.end.toLocaleTimeString("en-US", {timeZone: data.ianaTimeZone}),
			`https://www.google.com/maps/dir/?api=1&origin=${f(p)}&destination=${f(p2)}&travelmode=transit`
		]})
	
	const csv = [headers, ...placeRows, ...travelRows].join('\n')
        const hiddenElement = document.createElement('a');

        hiddenElement.href = 'data:attachment/text,' + encodeURI(csv);
        hiddenElement.target = '_blank';
        hiddenElement.download = 'myFile.csv';
        hiddenElement.click();
  }
  
  document.getElementById('csv').onclick = () => {
    download_csv(places, placeTimes, travelTimes)
  }
}

async function calcRoute(service, start, end, startTime) {
    const request = {
	origin: start.loc,
	destination: end.loc,
	transitOptions: { departureTime: startTime},
	drivingOptions: { departureTime: startTime},
	travelMode: 'DRIVING'
    };
    const res  = await service.route(request);

    return res.status === 'OK' ? res : undefined
}

const toDate = (dateStr, time, timeZone) => {
    const [day, month, year] = dateStr.split('/')
    const iso = `${year}-${month}-${day}T${time}:00.000${timeZone}`
    return new Date(iso)
}
