import '@openhps/rdf';
import { Absolute3DPosition, MemoryDataService } from '@openhps/core';
import { CSVDataObjectService } from '@openhps/csv';
import { Building, Floor, SymbolicSpace, SymbolicSpaceService } from '@openhps/geospatial';
import { BLEObject, MACAddress } from '@openhps/rf';
import { IriString, NamedNode, ogc, Quad, RDFSerializer, Store, Term } from '@openhps/rdf';

import * as fs from 'fs';
import * as path from 'path';

const BASE_URI = "http://sembeacon.org/example/";
const BEACONS_URI = BASE_URI + "beacons.ttl#" as IriString;
const BUILDING_URI = BASE_URI + "building.ttl#" as IriString;

async function loadData() {
    const data = {
        spaces: "",
        beacons: ""
    };

    console.log("Loading geospatial data ...");
    const geojsonStr = fs.readFileSync(
        path.join(__dirname, "../data/spaces.geo.json"), 
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
        file: path.join(__dirname, "../data/ble_devices.csv"),
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
    const dir = path.join(__dirname, "../dist/");
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "building.ttl"), data.spaces);
    fs.writeFileSync(path.join(dir, "beacons.ttl"), data.beacons);
}

setTimeout(() => {
    loadData();
}, 100)
