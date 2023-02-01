import '@openhps/rdf';
import { Absolute2DPosition, Absolute3DPosition, MemoryDataService } from '@openhps/core';
import { CSVDataObjectService } from '@openhps/csv';
import { Building, Floor, Room, SymbolicSpace, SymbolicSpaceService } from '@openhps/geospatial';
import { BLEiBeacon, BLEObject, MACAddress } from '@openhps/rf';
import { IriString, NamedNode, ogc, Quad, RDFSerializer, Store, Term } from '@openhps/rdf';

import * as fs from 'fs';
import * as path from 'path';

const BASE_URI = "https://sembeacon.org/examples/";

async function loadData1() {
    const DATASET = "kennedy2019";
    const DATASET_URI = `${BASE_URI}${DATASET}/` as IriString;
    console.log("Loading data for dataset ", DATASET_URI);
    const BEACONS_URI = DATASET_URI + "beacons1.ttl#" as IriString;

    const data = {
        beacons: ""
    };

    const room = new Room("");
    console.log("Loading beacon data ...");
    const roomDataStr = fs.readFileSync(
        path.join(__dirname, `../data/${DATASET}/experiment1/room-data.json`), 
        { encoding: 'utf-8' }
    );
    const roomData = JSON.parse(roomDataStr);
    const beacons = roomData['Landmarks'].map(landmark => {
        const beacon = new BLEiBeacon();
        beacon.uid = landmark.Label;
        beacon.displayName = landmark.Label;
        beacon.setPosition(new Absolute3DPosition(
            landmark.XLoc,
            landmark.YLoc,
            1.6     // From documentation
        ));
        return beacon;
    });
    data.beacons = await RDFSerializer.stringify(
        new Store(beacons.map(beacon => {
            return RDFSerializer.serializeToQuads(beacon, BEACONS_URI);
        }).reduce((a, b) => [...a, ...b])),
        { prettyPrint: true, baseUri: BEACONS_URI });

    console.log("Saving RDF data ...");
    const dir = path.join(__dirname, "../dist/", DATASET);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "beacons1.ttl"), data.beacons);
}

async function loadData2() {
    const DATASET = "kennedy2019";
    const DATASET_URI = `${BASE_URI}${DATASET}/` as IriString;
    console.log("Loading data for dataset ", DATASET_URI);
    const BEACONS_URI = DATASET_URI + "beacons2.ttl#" as IriString;

    const data = {
        beacons: ""
    };

    const room = new Room("");
    console.log("Loading beacon data ...");
    const roomDataStr = fs.readFileSync(
        path.join(__dirname, `../data/${DATASET}/experiment2/room-data.json`), 
        { encoding: 'utf-8' }
    );
    const roomData = JSON.parse(roomDataStr);
    const beacons = roomData['Landmarks'].map(landmark => {
        const beacon = new BLEiBeacon();
        beacon.uid = landmark.Label;
        beacon.displayName = landmark.Label;
        beacon.setPosition(new Absolute3DPosition(
            landmark.XLoc,
            landmark.YLoc,
            1.6     // From documentation
        ));
        return beacon;
    });
    data.beacons = await RDFSerializer.stringify(
        new Store(beacons.map(beacon => {
            return RDFSerializer.serializeToQuads(beacon, BEACONS_URI);
        }).reduce((a, b) => [...a, ...b])),
        { prettyPrint: true, baseUri: BEACONS_URI });

    console.log("Saving RDF data ...");
    const dir = path.join(__dirname, "../dist/", DATASET);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "beacons2.ttl"), data.beacons);
}

async function loadData3() {
    const DATASET = "openhps2021";
    const DATASET_URI = `${BASE_URI}${DATASET}/` as IriString;
    console.log("Loading data for dataset ", DATASET_URI);
    const BEACONS_URI = DATASET_URI + "beacons.ttl#" as IriString;
    const BUILDING_URI = DATASET_URI + "building.ttl#" as IriString;

    const data = {
        spaces: "",
        beacons: ""
    };

    console.log("Loading geospatial data ...");
    const geojsonStr = fs.readFileSync(
        path.join(__dirname, `../data/${DATASET}/spaces.geo.json`), 
        { encoding: 'utf-8' }
    );
    const geojson = JSON.parse(geojsonStr);
    const spaces = geojson.features.map(feature => SymbolicSpace.fromGeoJSON(feature));
    const spaceService = new SymbolicSpaceService(new MemoryDataService(SymbolicSpace));
    await spaceService.emitAsync('build');
    await Promise.all(spaces.map(space => spaceService.insertObject(space)));
    data.spaces = await RDFSerializer.stringify(
        new Store(spaces.map(space => RDFSerializer.serializeToQuads(space, BUILDING_URI)).reduce((a, b) => [...a, ...b])),
        { prettyPrint: true, baseUri: BUILDING_URI });

    console.log("Loading beacon data ...");
    const building = spaces.filter(space => space instanceof Building)[0];
    const floor = spaces.filter(space => space instanceof Floor)[0];
    const beaconService = new CSVDataObjectService(BLEObject, {
        file: path.join(__dirname, `../data/${DATASET}/ble_devices.csv`),
        rowCallback: (row: any) => {
            const object = new BLEObject(MACAddress.fromString("00:11:22:33:44"));
            object.uid = row.ID;
            object.displayName = row.ID;
            object.setPosition(
                building.transform(
                    floor.transform(new Absolute3DPosition(
                        parseFloat(row.X),
                        parseFloat(row.Y),
                        1.6
                    ))
                ));
            return object;
        }
    });
    await beaconService.emitAsync('build');
    const beacons: BLEObject[] = await beaconService.findAll();
    data.beacons = await RDFSerializer.stringify(
        new Store(await beacons.map(async beacon => {
            const quads = RDFSerializer.serializeToQuads(beacon, BEACONS_URI);

            // Add information on where a beacon is placed
            const candidates = await spaceService.findSymbolicSpaces(beacon.getPosition());
            if (candidates.length > 0) {
                const deployment = RDFSerializer.serializeToQuads(candidates[0][0], BUILDING_URI)[0];
                quads.push(new Quad(quads[0].subject, new NamedNode(ogc.sfWithin), deployment.subject))
            }

            return quads;
        }).reduce(async (a, b) => [...await a, ...await b])),
        { prettyPrint: true, baseUri: BEACONS_URI });
    
    console.log("Saving RDF data ...");
    const dir = path.join(__dirname, "../dist/", DATASET);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "building.ttl"), data.spaces);
    fs.writeFileSync(path.join(dir, "beacons.ttl"), data.beacons);
}

setTimeout(() => {
    loadData1();
    loadData2();
    loadData3();
}, 100);
