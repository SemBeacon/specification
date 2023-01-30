import '@openhps/rdf';
import { Absolute2DPosition, Absolute3DPosition, DataSerializerUtils } from '@openhps/core';
import { CSVDataObjectService } from '@openhps/csv';
import { Building, SymbolicSpace } from '@openhps/geospatial';
import { BLEObject, MACAddress } from '@openhps/rf';
import { RDFSerializer, Store } from '@openhps/rdf';

import * as fs from 'fs';
import * as path from 'path';

const BASE_URI = "http://sembeacon.org/example/";

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
    data.spaces = await RDFSerializer.stringify(
        new Store(spaces.map(space => RDFSerializer.serializeToQuads(space, BASE_URI)).reduce((a, b) => [...a, ...b])),
        { prettyPrint: true, baseUri: BASE_URI });

    console.log("Loading beacon data ...");
    const service = new CSVDataObjectService(BLEObject, {
        file: path.join(__dirname, "../data/ble_devices.csv"),
        rowCallback: (row: any) => {
            const object = new BLEObject(MACAddress.fromString("00:11:22:33:44"));
            object.uid = row.ID;
            object.displayName = row.ID;
            const building = spaces.filter(space => space instanceof Building)[0];
            object.setPosition(building.transform(new Absolute3DPosition(
                parseFloat(row.X),
                parseFloat(row.Y),
                1.6
            )));
            return object;
        }
    });
    await service.emitAsync('build');
    const beacons: BLEObject[] = await service.findAll();
    data.beacons = await RDFSerializer.stringify(
        new Store(beacons.map(beacon => RDFSerializer.serializeToQuads(beacon, BASE_URI)).reduce((a, b) => [...a, ...b])),
        { prettyPrint: true, baseUri: BASE_URI });
    
    fs.writeFileSync(path.join(__dirname, "../dist/", "building.ttl"), data.spaces);
    fs.writeFileSync(path.join(__dirname, "../dist/", "beacons.ttl"), data.beacons);
}

setTimeout(() => {
    loadData();
}, 100)
