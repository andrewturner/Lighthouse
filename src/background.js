// This background script is initialised and executed once and exists
// separate to all other pages.

const $ = require('jquery');
const tj = require('togeojson');

//Sit Aware Map Data Feeds
const rfsMajorIncidentsFeed = "https://www.rfs.nsw.gov.au/feeds/majorIncidents.json";
const transportFeed = "https://api.transport.nsw.gov.au/";
const openSkyFeed = "https://opensky-network.org/api/states/all";
const essentialEnergyOutagesFeed = 'http://www.essentialenergy.com.au/Asset/kmz/current.kml';
const endeavourEnergyOutagesFeed = 'http://www.endeavourenergy.com.au/mobileapp/outage/outages/listBoth/current';
const ausgridBaseUrl = 'https://www.ausgrid.com.au/';

//block message js core request, fetch the file, inject our vars then serve it back to the requestor. :-)
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        console.log("blocking message js request")
        var javascriptCode = loadSynchronously(details.url);
        var replaced = "var msgsystem;"+javascriptCode.replace("CreateMessageViewModel,f,t,i,r,u;","CreateMessageViewModel,f,t,i,r,u;msgsystem = n;");
        return { redirectUrl: "data:text/javascript,"+encodeURIComponent(replaced) };
    },
    { urls: ["https://*.ses.nsw.gov.au/js/messages/create?v=*"] },
    ["blocking"]
    );

//block job create js core requests, fetch the original file async, replace some stuff, serve the file back to the requestor.
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        console.log("blocking jobs create js request")
        var javascriptCode = loadSynchronously(details.url);
        var replaced = "var jobsystem;"+javascriptCode.replace("var n=this,t,i;n.MessageTemplateManager","var n=this,t,i;jobsystem=n;n.MessageTemplateManager");
        return { redirectUrl: "data:text/javascript,"+encodeURIComponent(replaced) };
    },
    { urls: ["https://*.ses.nsw.gov.au/js/jobs/create?v=*"] },
    ["blocking"]
    );

//block job register js core requests, fetch the original file async, replace some stuff, serve the file back to the requestor.
// Reaplce the date picker with more options
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        console.log("blocking jobs register js request")
        var javascriptCode = loadSynchronously(details.url);
        var replaced = javascriptCode.replace('"Last Month":[utility.dateRanges.LastMonth.StartDate(),utility.dateRanges.LastMonth.EndDate()]','"Last Month":[utility.dateRanges.LastMonth.StartDate(), utility.dateRanges.LastMonth.EndDate()],"This Calendar Year":[moment().startOf(\'year\'), moment().endOf(\'year\')],"All":\n [utility.minDate, moment().endOf(\'year\')]');
        return { redirectUrl: "data:text/javascript,"+encodeURIComponent(replaced) };
    },
    { urls: ["https://*.ses.nsw.gov.au/js/jobs/register?v=*","https://*.ses.nsw.gov.au/js/jobs/tasking?v=*"] },
    ["blocking"]
    );


chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        console.log(request);
        if (request.type === "asbestos") {
            checkAsbestosRegister(request.address,function(result,colour,bool,url){
                sendResponse({result: result, colour: colour, resultbool: bool, requrl: url})
            });
            return true;
        } else if (request.type === 'rfs') {
            fetchRfsIncidents(function(data) {
                sendResponse(data);
            });
            return true;
        } else if (request.type === 'transport-incidents') {
            fetchTransportResource('v1/live/hazards/incident/open', function(data) {
                sendResponse(data);
            }, request.params.apiKey);
            return true;
        } else if (request.type === 'transport-flood-reports') {
            fetchTransportResource('v1/live/hazards/flood/open', function(data) {
                sendResponse(data);
            }, request.params.apiKey);
            return true;
        } else if (request.type === 'transport-cameras') {
            fetchTransportResource('v1/live/cameras', function(data) {
                sendResponse(data);
            }, request.params.apiKey);
            return true;    
        } else if (request.type === 'helicopters') {
            fetchHelicopterLocations(request.params, function(data) {
                sendResponse(data);
            });
            return true;
        } else if (request.type === 'bom-weather-stations') {
            fetchWeatherStations(function(data) {
                sendResponse(data);
            });
            return true;
        } else if (request.type === 'power-outages') {
            fetchPowerOutages(function(data) {
                sendResponse(data);
            });
            return true;
        }
    });

//block so that the code can come back before letting the page load
//possibly should rewrite this so its not blocking but that will have ramifications
function loadSynchronously(url) {
    var request = new XMLHttpRequest();
    request.open('GET', url, false);  // `false` makes the request synchronous
    request.send(null);
    if (request.status === 200) {
        return(request.responseText);
    } else {
        console.log("error downloading resource")
    }
}

/**
 * Fetches the current RFS incidents from their JSON feed.
 *
 * @param callback the callback to send the data to.
 */
 function fetchRfsIncidents(callback) {
    console.info('fetching RFS incidents');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            callback(JSON.parse(xhttp.responseText));
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('GET', rfsMajorIncidentsFeed, true);
    xhttp.send();
}

/**
 * Fetches a resource from the transport API.
 *
 * @param path the path to the resource, e.g. ''.
 * @param callback the callback to send the data to.
 * @param apiKey the transport.nsw.gov.au API key.
 */
 function fetchTransportResource(path, callback, apiKey) {
    console.info('fetching transport resource: ' + path);
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            callback(JSON.parse(xhttp.responseText));
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('GET', transportFeed + path, true);
    xhttp.setRequestHeader('Authorization', 'apikey ' + apiKey);
    xhttp.send();
}

/**
 * Fetches the current rescue helicopter locations.
 *
 * @param params the HTTP URL parameters to add.
 * @param callback the callback to send the data to.
 */
 function fetchHelicopterLocations(params, callback) {
    console.info('fetching helicopter locations');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            callback(JSON.parse(xhttp.responseText));
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('GET', openSkyFeed + params, true);
    xhttp.send();
}

/**
 * Fetches the latest weather station readings.
 *
 * @param callback the callback to send the data to.
 */
 function fetchWeatherStations(callback) {
    console.info('fetching weather station details');

    $.getJSON(chrome.extension.getURL('resources/BOM_weather_stations.geojson'), function (stationList) {
        var promises = [];

        // Grab each station from our list and query the BOM for the latest details
        stationList.features.forEach(function (station) {
            var url = station.properties.feedUrl;

            promises.push(new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.onloadend = function () {
                    if (this.readyState === 4 && this.status === 200) {
                        var stationJson = JSON.parse(xhr.responseText);
                        if (stationJson.observations && stationJson.observations.data) {
                            var weatherData = stationJson.observations.data[0];
                            station.properties.lastUpdate = weatherData.local_date_time_full;
                            station.properties.apparentTemp = weatherData.apparent_t;
                            station.properties.cloud = weatherData.cloud;
                            station.properties.cloudBaseM = weatherData.cloud_base_m;
                            station.properties.deltaTemp = weatherData.delta_t;
                            station.properties.windGustKmh = weatherData.gust_kmh;
                            station.properties.windGustKt = weatherData.gust_kt;
                            station.properties.airTemp = weatherData.air_temp;
                            station.properties.rainSince9am = weatherData.rain_trace;
                            station.properties.windDirection = weatherData.wind_dir;
                            station.properties.windSpeedKmh = weatherData.wind_spd_kmh;
                            station.properties.windSpeedKt = weatherData.wind_spd_kt;
                        }
                    }

                    resolve(station);
                };
                xhr.send();
            }));
        });

        // Wait for all station data, then send the result back
        Promise.all(promises).then(function(features) {
            var geoJson = {
                'type': 'FeatureCollection',
                'features': []
            };

            // Collect all non-null features
            features.forEach(function (feature) {
                if (feature) {
                    geoJson.features.push(feature);
                }
            });

            console.debug('Found details for ' + geoJson.features.length + ' stations');
            callback(geoJson);
        });
    });
}

/**
 * Fetches the current power outage details.
 *
 * @param callback the callback to send the data to.
 */
 function fetchPowerOutages(callback) {
    console.info('fetching power outage locations');
    var finalData = {}

    fetchEssentialEnergyOutages(function(essentialEnergyData) {
        finalData.essential = essentialEnergyData
        merge()
    })

    fetchEndeavourEnergyOutages(function(endeavourEnergyData) {
        finalData.endeavour = endeavourEnergyData
        merge()
    })

    fetchAusgridOutages(function(AusgridData){
        finalData.ausgrid = AusgridData
        merge()
    });



    function merge() {
        console.log("checking if all power outage data is back")
        if (finalData.essential && finalData.endeavour && finalData.ausgrid)
        {
            console.log("merging power outages")
            var merged = {}
            merged.features = []
            //if you just push you end up with an array of the array not a merged array like you might want.
            merged.features.push.apply(merged.features,finalData.essential.features)
            merged.features.push.apply(merged.features,finalData.endeavour.features)
            merged.features.push.apply(merged.features,finalData.ausgrid.features)
            callback(merged);
        } else {
            console.log("missing some power outage data")
        }
    }
}

/**
 * Fetches the current power outages for Ausgrid.
 *
 * @param callback the callback to send the data to.
 */
 function fetchAusgridOutages(callback) {
    console.info('fetching ausgrid power outage locations');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            geoJson = {
                'type': 'FeatureCollection',
                'features': []
            };

            var result = JSON.parse(xhttp.responseText)

            var expectCount = 0

            result.d.Data.forEach(function(item) {
                if (item.WebId != 0)
                {
                    expectCount++
                }
            })

            if (expectCount == 0) //call back if theres none.
            {
                callback(geoJson)
            }

            result.d.Data.forEach(function(item) {
                if (item.WebId != 0)
                {
                    //build up some geojson from normal JSON
                    var feature = {}
                    feature.geometry = {}
                    feature.geometry.type = "GeometryCollection"
                    feature.geometry.geometries = []

                    //make a polygon from each set
                    var polygon = {}
                    polygon.type = "Polygon"
                    polygon.coordinates = []

                    var ords = []
                    item.Coords.forEach(function(point){
                        ords.push([point.lng,point.lat])
                    })

                    ords.push([item.Coords[0].lng,item.Coords[0].lat]) //push the first item again at the end to complete the polygon

                    polygon.coordinates.push(ords)

                    feature.geometry.geometries.push(polygon)

                    //make a point to go with the polygon //TODO - center this in the polygon - geo maths centroid
                    var point = {}
                    point.type = "Point"
                    point.coordinates = []
                    point.coordinates.push(item.Coords[0].lng,item.Coords[0].lat)

                    feature.geometry.geometries.push(point)                    
                    
                    fetchAusgridOutage(item.WebId,item.OutageDisplayType, function(outageresult){ //for each outage ask their API for the deatils of the outage
                        if (typeof(outageresult.error) === 'undefined') //if no error
                        {
                            feature.owner = "Ausgrid"
                            feature.type = "Feature"
                            feature.properties = {}
                            feature.properties.numberCustomerAffected = outageresult.d.Data.Customers
                            feature.properties.incidentId = outageresult.d.Data.WebId
                            feature.properties.reason = outageresult.d.Data.Cause
                            feature.properties.status = outageresult.d.Data.Status
                            feature.properties.type = "Outage"
                            feature.properties.startDateTime = outageresult.d.Data.StartDateTime
                            feature.properties.endDateTime = outageresult.d.Data.EstRestTime
                            geoJson.features.push(feature)
                        } else {
                            expectCount--
                        }
                        if (geoJson.features.length == expectCount) //return once all the data is back
                        {
                            callback(geoJson)
                        }
                    })
}
})
} else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('POST', ausgridBaseUrl + 'services/Outage/Outage.asmx/GetOutages', true);
    xhttp.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    var blob = new Blob(['{"box":{"bottomleft":{"lat":-33.77499909311501,"lng":149.5178374449364},"topright":{"lat":-33.08275780283044,"lng":152.50337211290514},"zoom":9}}'], {type: 'text/plain'});
    xhttp.send(blob);
}

/**
 * Fetche Ausgrid power outage detail.
 * @param webId web ID
 * @param type OutageDisplayType 
 * @param callback the callback to send the data to.
 */
 function fetchAusgridOutage(id,type,callback) {
    console.info('fetching ausgrid power outage detail');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {

            try {
                var json = JSON.parse(xhttp.responseText);
            } catch(err) {
                console.log("ausgrid feed is invalid. discarding")
                var json = []

            }
            callback(json)
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('POST', ausgridBaseUrl + 'services/Outage/Outage.asmx/GetOutage', true);
    xhttp.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    var blob = new Blob(['{"id":{"WebId":"'+id+'","OutageDisplayType":"'+type+'"}}'], {type: 'text/plain'});
    xhttp.send(blob);
}


/**
 * Fetches the current power outages for Endeavour Energy.
 *
 * @param callback the callback to send the geoJSON data to.
 */
 function fetchEndeavourEnergyOutages(callback) {
    console.info('fetching endeavour energy power outage locations');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            try {
                var json = JSON.parse(xhttp.responseText);
            } catch(err) {
                console.log("endeavour energy feed is invalid. discarding")
                var json = []

            }
            geoJson = {
                'type': 'FeatureCollection',
                'features': []
            };

            // Convert the feed to geoJSON
            for (var i = 0; i < json.length; i++) {
                var incident = json[i];

                var feature = {
                    'type': 'Feature',
                    'owner': 'EndeavourEnergy',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [
                        incident.longitude,
                        incident.latitude
                        ]
                    },
                    'properties': {
                        'creationDateTime': incident.creationDateTime,
                        'endDateTime': incident.endDateTime,
                        'incidentId': incident.incidentId,
                        'numberCustomerAffected': incident.numberCustomerAffected,
                        'outageType': incident.outageType,
                        'postcode': incident.postcode,
                        'reason': incident.reason,
                        'startDateTime': incident.startDateTime,
                        'status': incident.status,
                        'streetName': incident.streetName,
                        'suburb': incident.suburb
                    }
                };

                geoJson.features.push(feature);
            }

            callback(geoJson);
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('GET', endeavourEnergyOutagesFeed, true);
    xhttp.send();
}

/**
 * Fetches the current power outages for Essential Energy.
 *
 * @param callback the callback to send the geoJSON data to.
 */
 function fetchEssentialEnergyOutages(callback) {
    console.info('fetching essential energy power outage locations');
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function () {
        if (this.readyState === 4 && this.status === 200) {
            var kml = xhttp.responseXML;
            var geoJson = tj.kml(kml);
            for (var i = 0; i < geoJson.features.length; i++) {
                geoJson.features[i].owner='EssentialEnergy'
            }
            callback(geoJson);
        } else {
            // error
            var response = {
                error: 'Request failed',
                httpCode: this.status
            };
            callback(response);
        }
    };
    xhttp.open('GET', essentialEnergyOutagesFeed, true);
    xhttp.send();
}

function checkAsbestosRegister( inAddressObject, cb ){

    var AddressParts = /^(.+)\s(.+)$/.exec( inAddressObject.Street );
    if( !inAddressObject.Flat )
        inAddressObject.Flat = "";
    var formAddress = "http://www.fairtrading.nsw.gov.au/ftw/Tenants_and_home_owners/Loose_fill_asbestos_insulation/Public_Search/LFAI_Public_Register.page?"+
    "idol_totalhits=0&currentPage=1&"+
    "form-unit="+encodeURI(inAddressObject.Flat)+"&"+
    "form-streetno="+encodeURI(inAddressObject.StreetNumber)+"&"+
    "form-street="+encodeURI(AddressParts[1])+"&"+
    "form-streettype="+encodeURI(AddressParts[2])+"&"+
    "form-suburb="+encodeURI(inAddressObject.Locality)+"&"+
    "propertyaddress=Property%3A%28"+encodeURI(inAddressObject.Flat+" "+inAddressObject.StreetNumber+" "+inAddressObject.Street+" "+inAddressObject.Locality)+"%29";

    console.log("loading cache")
    var ftCache = JSON.parse(localStorage.getItem("lighthouseFTCache"));
    var needToWriteChange = false;
    if (ftCache) {

        //walk the cache and clean it up first
        
        var foundinCache = false
        ftCache.forEach(function(item) {

            if (item.url == formAddress)
            {
                console.log("found url in the cache")
                foundinCache = true
                console.log( 'cache is '+((new Date().getTime() - new Date(item.timestamp).getTime())/1000/60)+'mins old')
                if (((new Date().getTime() - new Date(item.timestamp).getTime())/1000/60) < 4320) //3 days
                {
                        //its in the cache
                        console.log( 'using it');
                        processResult(item.result)
                    } else {
                        //oooooold
                        console.log("cached item is stale. fetching new result")
                        ftCache.splice(ftCache.indexOf(item),1) //remove this item from the cache
                        needToWriteChange = true
                        pullFTRegister(function(result){
                            if (result != 0) //dont cache error results
                            {
                                var cacheItem = {}
                                cacheItem.url = formAddress
                                cacheItem.timestamp = (new Date().toString())
                                cacheItem.result = result
                                ftCache.push(cacheItem)
                                needToWriteChange = true
                            }
                            //return result
                            processResult(result)

                        })

                    }
                } else {
                    if (((new Date().getTime() - new Date(item.timestamp).getTime())/1000/60) > 4320) //3 days
                    {
                        console.log("cleaning stale cache item "+item.url+" age:"+((new Date().getTime() - new Date(item.timestamp).getTime())/1000/60)+'mins old')
        ftCache.splice(ftCache.indexOf(item),1) //remove this item from the cache
        needToWriteChange = true
    }
}
})

if (foundinCache == false)
{
    console.log("did not find url in the cache")
    pullFTRegister(function(result){
        if (result != 0) //dont cache error results
        {
            var cacheItem = {}
            cacheItem.url = formAddress
            cacheItem.timestamp = (new Date().toString())
            cacheItem.result = result
            ftCache.push(cacheItem)
            needToWriteChange = true
        }
        //return result
        processResult(result)
    })
}
} else {
    //there is no cache so make one
    console.log("no cache object. creating a new one")
    var ftCache = []
    pullFTRegister(function(result){
        if (result != 0) //dont cache error results
        {
            var cacheItem = {}
            cacheItem.url = formAddress
            cacheItem.timestamp = (new Date().toString())
            cacheItem.result = result
            ftCache.push(cacheItem)
            needToWriteChange = true
        }
        //return result
        processResult(result)

    })
}

//if we never call processResult we should write the changes out here.
if (needToWriteChange)
{
    console.log("writing out lighthouseFTCache")
    localStorage.setItem("lighthouseFTCache", JSON.stringify(ftCache));
}


function processResult(result){
    switch(result) {
        case 0: //error
        console.log( 'Error searching' );
        cb("Error Searching The Asbestos Register<i class='fa fa-external-link' aria-hidden='true' style='margin-left:5px;margin-right:-5px'></i>","",false,formAddress)
        break
        case 1: //positive/found
        console.log( 'On the Register' );
        cb(inAddressObject.PrettyAddress+" was FOUND on the loose fill insulation asbestos register<i class='fa fa-external-link' aria-hidden='true' style='margin-left:5px;margin-right:-5px'></i>","red",true,formAddress)
        break
        case 2: //negative/not found
        console.log( 'Not the Register' );
        cb(inAddressObject.PrettyAddress+" was not found on any register.","",false,formAddress)
        break
    }
    if (needToWriteChange)
    {
        needToWriteChange = false;
        console.log("writing out lighthouseFTCache")
        localStorage.setItem("lighthouseFTCache", JSON.stringify(ftCache));
    }
}


function pullFTRegister(cb){
    var xhttp = new XMLHttpRequest();
    xhttp.onloadend = function(){
        if( this.readyState == 4 && this.status == 200 ){
            if (!( /No\sMatch\sFound/.test( this.responseText ) ) && !( /Confirmed\sMatch/.test( this.responseText ))){
                cb(0) //error
            }
            if( /Confirmed\sMatch/.test( this.responseText ) ){
                cb(1) //found
            }
            if( /No\sMatch\sFound/.test( this.responseText ) ){
                cb(2) //not found
            }
        } else {
            cb(0) //error
        }
    };
    xhttp.open("GET", formAddress, true);
    xhttp.send();
}

}
