import { Absolute2DPosition, DataSerializerUtils } from '@openhps/core';
import { CSVDataObjectService } from '@openhps/csv';
import { SymbolicSpace } from '@openhps/geospatial';
import { BLEObject, MACAddress } from '@openhps/rf';
import { RDFSerializer } from '@openhps/rdf';

import * as fs from 'fs';
import * as path from 'path';

const BASE_URI = "http://sembeacon.org/example/";

async function loadData() {
    console.log("Loading geospatial data ...");
    const geojsonStr = fs.readFileSync(
        path.join(__dirname, "../data/spaces.geo.json"), 
        { encoding: 'utf-8' }
    );
    const geojson = JSON.parse(geojsonStr);
    const spaces = geojson.features.map(feature => SymbolicSpace.fromGeoJSON(feature));
    Object.values(spaces).forEach(async space => {
        console.log(DataSerializerUtils.getRootMetadata(space.constructor))
        console.log(await RDFSerializer.stringify(space, {
            baseUri: `https://test.com/`
        }));
    });

    console.log("Loading beacon data ...");
    const service = new CSVDataObjectService(BLEObject, {
        file: path.join(__dirname, "../data/ble_devices.csv"),
        rowCallback: (row: any) => {
            const object = new BLEObject(MACAddress.fromString("00:11:22:33:44"));
            object.uid = row.ID;
            object.displayName = row.ID;
            object.setPosition(spaces[0].transform(new Absolute2DPosition(
                parseFloat(row.X),
                parseFloat(row.Y)
            )));
            return object;
        }
    });
    await service.emitAsync('build');
    const beacons: BLEObject[] = await service.findAll();
    beacons.forEach(async beacon => {
        console.log(await RDFSerializer.stringify(beacon, {
            baseUri: `https://test.com/`
        }));
    });
}

loadData();